import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Game Constants ---
const COUNTDOWN_SECONDS = 3;

// --- Server State ---
let rooms = {}; // Stores all active rooms
let socketToRoom = {}; // Maps socket.id to roomId
let socketToUsername = {}; // Maps socket.id to username

// --- Game Logic (Per-Room) ---
import * as gameLogic from './gameLogic.js';
import * as db from './database.js';

// --- Helper Functions ---
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getPublicRoomData() {
    return Object.values(rooms)
        .filter(room => !room.isPrivate)
        .map(room => ({
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

function emitOnlineUsers() {
    const onlineUsernames = Object.values(socketToUsername);
    io.emit('onlineUsers', onlineUsernames);
}

// --- Socket.IO Connection Handling ---
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', async ({ username }) => {
        if (!username || username.length <= 0 || username.length > 15) {
            return; // Handle invalid username if necessary
        }

        try {
            const player = await db.findOrCreatePlayer(username);
            socketToUsername[socket.id] = username;
            console.log(`User ${socket.id} logged in as ${username}`);

            // Corregir la estructura y el nombre de la propiedad
            const playerStats = {
                ...player,
                xpToNextLevel: db.getXpToNextLevel(player.level)
            };
            
            // Enviar estadísticas del jugador al cliente
            socket.emit('playerStats', playerStats);

            emitOnlineUsers();
        } catch (error) {
            console.error('Error during login:', error);
            // Optionally, emit an error to the client
        }
    });

    socket.emit('roomList', getPublicRoomData());

    socket.on('createRoom', ({ duration, mode, isPrivate }) => {
        const roomId = generateRoomId();
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
            name: `Sala de ${socketToUsername[socket.id]}`,
            owner: socket.id,
            maxPlayers: maxPlayers,
            mode: mode || '1vs1',
            duration: duration || 300,
            isPrivate: isPrivate || false,
            gameState: gameLogic.createInitialState(duration || 300, mode || '1vs1'),
            intervals: {},
            countdownTimer: null,
            kickoffCountdownTimer: null
        };
        rooms[roomId] = room;

        console.log(`Room "${room.name}" (${roomId}) created by ${socket.id} with mode ${room.mode}, duration ${room.duration}s, private: ${room.isPrivate}`);

        joinRoom(socket, roomId);
    });

    socket.on('joinRoom', ({ roomId }) => {
        joinRoom(socket, roomId);
    });

    socket.on('joinRoomById', ({ roomId }) => {
        const roomToJoin = Object.values(rooms).find(r => r.id.toUpperCase() === roomId.toUpperCase());
        if (roomToJoin) {
            joinRoom(socket, roomToJoin.id);
        } else {
            socket.emit('error', 'No se encontró ninguna sala con ese ID.');
        }
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

    socket.on('getGlobalRanking', async ({ sortBy }) => {
        try {
            const ranking = await db.getGlobalRanking(sortBy);
            socket.emit('globalRankingUpdate', ranking);
        } catch (error) {
            console.error('Error fetching global ranking:', error);
            socket.emit('error', 'Could not fetch global ranking.');
        }
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
        emitOnlineUsers();
    });
});

function startKickoffSequence(roomId) {
    const room = rooms[roomId];
    if (!room || room.kickoffCountdownTimer) return; // Already counting down

    console.log(`Kickoff countdown started in room ${roomId}`);
    let countdown = COUNTDOWN_SECONDS;
    io.to(roomId).emit('kickoffCountdown', { count: countdown });

    room.kickoffCountdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            io.to(roomId).emit('kickoffCountdown', { count: countdown });
        } else {
            clearInterval(room.kickoffCountdownTimer);
            room.kickoffCountdownTimer = null;
            gameLogic.resumeAfterKickoff(room.gameState);
            console.log(`Kickoff countdown finished in room ${roomId}. Resuming game.`);
            io.to(roomId).emit('kickoffCountdown', { count: '' }); // Hide countdown on client
        }
    }, 1000);
}

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
            io.to(roomId).emit('gameCountdown', { count: '' }); // Clear countdown on clients
            console.log(`Countdown cancelled in room ${roomId}`);
        }
    }
}

function startGameSequence(roomId) {
    const room = rooms[roomId];
    if (!room || room.countdownTimer) return; // Already counting down

    console.log(`All players ready in room ${roomId}. Starting countdown...`);
    let countdown = COUNTDOWN_SECONDS;
    io.to(roomId).emit('gameCountdown', { count: countdown, mode: room.mode });

    room.countdownTimer = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            io.to(roomId).emit('gameCountdown', { count: countdown, mode: room.mode });
        } else if (countdown === 0) {
            io.to(roomId).emit('gameCountdown', { count: '¡YA!', mode: room.mode });
        }

        if (countdown === 0) {
            clearInterval(room.countdownTimer);
            room.countdownTimer = null;

            // Start the actual game
            console.log(`Starting game in room ${roomId}`);
            gameLogic.startGame(room.gameState, (gameState) => {
                io.to(roomId).emit('gameState', gameState);
            }, (gameOverState) => {
                // Game has ended, save stats before notifying clients
                saveAndEndGame(roomId, gameOverState);
            }, () => {
                startKickoffSequence(roomId);
            }, room.intervals);
            io.to(roomId).emit('gameStart', room.gameState);
            setTimeout(() => io.to(roomId).emit('gameCountdown', { count: '' }), 1000); // Hide message after 1s
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
        io.to(roomId).emit('gameCountdown', { count: '' }); // Clear countdown on clients
        console.log(`Countdown cancelled in room ${roomId} due to player leaving.`);
    }

    if (room.kickoffCountdownTimer) {
        clearInterval(room.kickoffCountdownTimer);
        room.kickoffCountdownTimer = null;
        io.to(roomId).emit('kickoffCountdown', { count: '' });
    }

    socket.leave(roomId);
    delete socketToRoom[socket.id];
    gameLogic.removePlayer(room.gameState, socket.id);

    console.log(`${socket.id} left room ${roomId}`);

    // Reset ready status for remaining players
    Object.values(room.gameState.players).forEach(p => p.isReady = false);

    if (wasGameRunning) {
        gameLogic.endGame(room.gameState, 'disconnect');
        saveAndEndGame(roomId, room.gameState);
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

async function saveAndEndGame(roomId, gameOverState) {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`Game ended in room ${roomId}. Saving stats...`);

    try {
        await db.saveGameStats(gameOverState, room.duration);
        console.log(`Stats for room ${roomId} saved successfully.`);

        // Después de guardar, obtener y enviar estadísticas actualizadas a cada jugador
        for (const playerInfo of Object.values(gameOverState.players)) {
            try {
                const player = await db.getPlayerStats(playerInfo.username);
                const updatedStats = {
                    ...player,
                    xpToNextLevel: db.getXpToNextLevel(player.level) // Corregir nombre de la propiedad
                };
                // Emitir al socket específico usando su ID
                io.to(playerInfo.id).emit('playerStats', updatedStats);
            } catch (statError) {
                console.error(`Error fetching updated stats for ${playerInfo.username}:`, statError);
            }
        }
    } catch (error) {
        console.error(`Failed to save stats for room ${roomId}:`, error);
    } finally {
        // Clear intervals and notify clients regardless of whether stats were saved
        if (room.intervals) {
            clearInterval(room.intervals.game);
            clearInterval(room.intervals.timer);
        }
        if (room.kickoffCountdownTimer) {
            clearInterval(room.kickoffCountdownTimer);
            room.kickoffCountdownTimer = null;
        }
        
        io.to(roomId).emit('gameOver', {
            score: gameOverState.score,
            winner: gameOverState.winner,
            playerMatchStats: gameOverState.playerMatchStats
        });
    }
}

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});