const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// --- Game Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SNAKE_SIZE = 20;
const BALL_SIZE = 15;
const GOAL_HEIGHT = 150;
const GOAL_PAUSE_DURATION = 2000; // 2 seconds
const MAX_PLAYERS_PER_ROOM = 2; // For 1v1

// --- Server State ---
let rooms = {}; // Stores all active rooms
let socketToRoom = {}; // Maps socket.id to roomId

// --- Game Logic (Per-Room) ---
const gameLogic = require('./gameLogic');

// --- Helper Functions ---
function getPublicRoomData() {
    return Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: Object.keys(room.gameState.players).length,
        maxPlayers: room.maxPlayers,
        creatorId: room.creatorId,
        playerIds: Object.keys(room.gameState.players)
    }));
}

function emitRoomList() {
    io.emit('roomList', getPublicRoomData());
}

// --- Socket.IO Connection Handling ---
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send the current list of rooms to the new user
    socket.emit('roomList', getPublicRoomData());

    socket.on('createRoom', ({ name }) => {
        const roomId = uuidv4();
        const room = {
            id: roomId,
            name: name,
            creatorId: socket.id, // Set creator
            maxPlayers: MAX_PLAYERS_PER_ROOM,
            gameState: gameLogic.createInitialState(),
            intervals: {}
        };
        rooms[roomId] = room;

        console.log(`Room "${name}" (${roomId}) created by ${socket.id}`);

        // Automatically join the creator to the room
        joinRoom(socket, roomId);
    });

    socket.on('joinRoom', ({ roomId }) => {
        joinRoom(socket, roomId);
    });

    socket.on('deleteRoom', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.creatorId === socket.id) {
            console.log(`Room ${roomId} deleted by creator ${socket.id}`);
            
            // Notify all players in the room before disconnecting them
            io.to(roomId).emit('roomClosed', 'La sala ha sido cerrada por el creador.');

            // Disconnect all players and clean up
            const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
            if (socketsInRoom) {
                socketsInRoom.forEach(socketId => {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket) {
                        clientSocket.leave(roomId);
                        delete socketToRoom[clientSocket.id];
                    }
                });
            }

            // Stop game intervals if running
            if (room.intervals.game) clearInterval(room.intervals.game);
            if (room.intervals.timer) clearInterval(room.intervals.timer);

            delete rooms[roomId];
            emitRoomList();
        }
    });

    socket.on('leaveRoom', () => {
        leaveRoom(socket);
    });

    socket.on('directionChange', (data) => {
        const roomId = socketToRoom[socket.id];
        if (rooms[roomId]) {
            gameLogic.handleDirectionChange(rooms[roomId].gameState, socket.id, data.direction);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        leaveRoom(socket);
    });
});

function joinRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) {
        return socket.emit('error', 'La sala no existe.');
    }

    if (Object.keys(room.gameState.players).length >= room.maxPlayers) {
        return socket.emit('error', 'La sala está llena.');
    }

    leaveRoom(socket); // Leave any previous room

    socket.join(roomId);
    socketToRoom[socket.id] = roomId;

    const team = gameLogic.addPlayer(room.gameState, socket.id);
    console.log(`${socket.id} joined room ${roomId} as ${team}`);

    socket.emit('joinedRoom', room.id);
    io.to(roomId).emit('gameState', room.gameState);

    emitRoomList(); // Update everyone on the new room count

    // If room is full, start the game
    if (Object.keys(room.gameState.players).length === room.maxPlayers) {
        console.log(`Starting game in room ${roomId}`);
        gameLogic.startGame(room.gameState, (gameState) => {
            io.to(roomId).emit('gameState', gameState);
        }, (gameOverState) => {
            io.to(roomId).emit('gameOver', gameOverState);
            clearInterval(room.intervals.game);
            clearInterval(room.intervals.timer);
        }, room.intervals);
        io.to(roomId).emit('gameStart', room.gameState);
    }
}

function leaveRoom(socket) {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    socket.leave(roomId);
    delete socketToRoom[socket.id];
    gameLogic.removePlayer(room.gameState, socket.id);

    console.log(`${socket.id} left room ${roomId}`);

    // If game was running, end it
    if (!room.gameState.isGameOver) {
        gameLogic.endGame(room.gameState, 'disconnect');
        io.to(roomId).emit('gameOver', { score: room.gameState.score, winner: room.gameState.winner });
        clearInterval(room.intervals.game);
        clearInterval(room.intervals.timer);
    }

    // If room is empty, delete it
    if (Object.keys(room.gameState.players).length === 0) {
        console.log(`Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        // Otherwise, just update the remaining players and tell them to go to lobby
        const remainingPlayerId = Object.keys(room.gameState.players)[0];
        const remainingSocket = io.sockets.sockets.get(remainingPlayerId);
        if(remainingSocket) remainingSocket.emit('showLobby');

        io.to(roomId).emit('gameState', room.gameState);
    }

    emitRoomList(); // Update everyone on room changes
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});