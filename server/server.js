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
const MAX_PLAYERS_PER_ROOM = 2; // For 1v1
const COUNTDOWN_SECONDS = 3;

// --- Server State ---
let rooms = {}; // Stores all active rooms
let socketToRoom = {}; // Maps socket.id to roomId
let socketToUsername = {}; // Maps socket.id to username

// --- Game Logic (Per-Room) ---
const gameLogic = require('./gameLogic');

// --- Helper Functions ---
function getPublicRoomData() {
    return Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playerCount: Object.keys(room.gameState.players).length,
        maxPlayers: room.maxPlayers,
        mode: room.mode,
        owner: room.owner,
        duration: room.duration,
        players: Object.values(room.gameState.players).map(p => ({ id: p.id, team: p.team, isReady: p.isReady, username: p.username }))
    }));
}

function emitRoomList() {
    io.emit('roomList', getPublicRoomData());
}

// --- Socket.IO Connection Handling ---
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', ({ username }) => {
        if (username && username.length > 0 && username.length <= 15) {
            socketToUsername[socket.id] = username;
            console.log(`User ${socket.id} logged in as ${username}`);
            // Optionally, you could emit a success message or user data here
        } else {
            // Handle invalid username if necessary
        }
    });

    socket.emit('roomList', getPublicRoomData());

    socket.on('createRoom', ({ name, duration, mode }) => {
        const roomId = uuidv4();
        let maxPlayers;
        switch (mode) {
            case '2vs2':
                maxPlayers = 4;
                break;
            case '3vs3':
                maxPlayers = 6;
                break;
            case '1vs1':
            default:
                maxPlayers = 2;
                break;
        }

        const room = {
            id: roomId,
            name: name,
            owner: socket.id,
            maxPlayers: maxPlayers,
            mode: mode || '1vs1',
            duration: duration || 300,
            gameState: gameLogic.createInitialState(duration || 300, mode || '1vs1'),
            intervals: {},
            countdownTimer: null
        };
        rooms[roomId] = room;

        console.log(`Room "${name}" (${roomId}) created by ${socket.id} with mode ${room.mode} and duration ${room.duration}s`);

        joinRoom(socket, roomId);
    });

    socket.on('joinRoom', ({ roomId }) => {
        joinRoom(socket, roomId);
    });

    socket.on('playerReady', () => {
        const roomId = socketToRoom[socket.id];
        const room = rooms[roomId];
        if (!room) return;

        const player = room.gameState.players[socket.id];
        if (player) {
            player.isReady = !player.isReady; // Toggle ready state
            console.log(`Player ${socket.id} in room ${roomId} is now ${player.isReady ? 'ready' : 'not ready'}`);
            io.to(roomId).emit('roomUpdate', getPublicRoomDataFor(room));
            checkIfGameShouldStart(roomId);
        }
    });

    socket.on('deleteRoom', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.owner === socket.id) {
            // ... (delete room logic remains the same)
        }
    });

    socket.on('leaveRoom', () => {
        leaveRoom(socket);
    });

    socket.on('directionChange', (data) => {
        const roomId = socketToRoom[socket.id];
        if (rooms[roomId] && rooms[roomId].gameState.gameStarted) {
            gameLogic.handleDirectionChange(rooms[roomId].gameState, socket.id, data.direction);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User ${socketToUsername[socket.id]} (${socket.id}) disconnected`);
        leaveRoom(socket);
        delete socketToUsername[socket.id]; // Clean up username on disconnect
    });
});

function getPublicRoomDataFor(room) {
    return {
        id: room.id,
        name: room.name,
        playerCount: Object.keys(room.gameState.players).length,
        maxPlayers: room.maxPlayers,
        owner: room.owner,
        duration: room.duration,
        players: Object.values(room.gameState.players).map(p => ({ id: p.id, team: p.team, isReady: p.isReady, username: p.username }))
    };
}

function checkIfGameShouldStart(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const players = Object.values(room.gameState.players);
    const allPlayersReady = players.length === room.maxPlayers && players.every(p => p.isReady);

    if (allPlayersReady) {
        startGameSequence(roomId);
    } else {
        // If not everyone is ready, cancel any existing countdown
        if (room.countdownTimer) {
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            io.to(roomId).emit('gameCountdown', ''); // Clear countdown on clients
            console.log(`Countdown cancelled in room ${roomId}`);
        }
    }
}

function startGameSequence(roomId) {
    const room = rooms[roomId];
    if (!room || room.countdownTimer) return; // Already counting down

    console.log(`All players ready in room ${roomId}. Starting countdown...`);
    let countdown = COUNTDOWN_SECONDS;
    io.to(roomId).emit('gameCountdown', countdown);

    room.countdownTimer = setInterval(() => {
        countdown--;
        io.to(roomId).emit('gameCountdown', countdown);
        if (countdown === 0) {
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;
            io.to(roomId).emit('gameCountdown', '¡YA!');

            // Start the actual game
            console.log(`Starting game in room ${roomId}`);
            gameLogic.startGame(room.gameState, (gameState) => {
                io.to(roomId).emit('gameState', gameState);
            }, (gameOverState) => {
                io.to(roomId).emit('gameOver', gameOverState);
                clearInterval(room.intervals.game);
                clearInterval(room.intervals.timer);
            }, room.intervals);
            io.to(roomId).emit('gameStart', room.gameState);
            setTimeout(() => io.to(roomId).emit('gameCountdown', ''), 1000); // Hide message after 1s
        }
    }, 1000);
}

function joinRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', 'La sala no existe.');
    if (Object.keys(room.gameState.players).length >= room.maxPlayers) return socket.emit('error', 'La sala está llena.');

    leaveRoom(socket); // Leave any previous room

    socket.join(roomId);
    socketToRoom[socket.id] = roomId;

    const username = socketToUsername[socket.id] || 'Guest'; // Fallback for safety
    const team = gameLogic.addPlayer(room.gameState, socket.id, username);
    console.log(`${username} (${socket.id}) joined room ${roomId} as ${team}`);

    socket.emit('joinedRoom', getPublicRoomDataFor(room));
    io.to(roomId).emit('roomUpdate', getPublicRoomDataFor(room));

    emitRoomList();
}

function leaveRoom(socket) {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const wasGameRunning = room.gameState.gameStarted && !room.gameState.isGameOver;

    // If a countdown was in progress, cancel it
    if (room.countdownTimer) {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
        io.to(roomId).emit('gameCountdown', ''); // Clear countdown on clients
        console.log(`Countdown cancelled in room ${roomId} due to player leaving.`);
    }

    socket.leave(roomId);
    delete socketToRoom[socket.id];
    gameLogic.removePlayer(room.gameState, socket.id);

    console.log(`${socket.id} left room ${roomId}`);

    // Reset ready status for remaining players
    Object.values(room.gameState.players).forEach(p => p.isReady = false);

    if (wasGameRunning) {
        gameLogic.endGame(room.gameState, 'disconnect');
        io.to(roomId).emit('gameOver', { score: room.gameState.score, winner: room.gameState.winner });
        clearInterval(room.intervals.game);
        clearInterval(room.intervals.timer);
    }

    if (Object.keys(room.gameState.players).length === 0) {
        console.log(`Room ${roomId} is empty, deleting.`);
        delete rooms[roomId];
    } else {
        io.to(roomId).emit('roomUpdate', getPublicRoomDataFor(room));
    }

    socket.emit('showLobby');
    emitRoomList();
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});