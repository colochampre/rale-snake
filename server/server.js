const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const SNAKE_SIZE = 20;
const SNAKE_SPEED = 300; // Pixels per second
const BALL_SIZE = 15;
const GOAL_HEIGHT = 150;
const BALL_FRICTION = 0.96;
const BOUNCE_ENERGY_LOSS = 0.8;
const HIT_COOLDOWN_FRAMES = 4;
const BALL_HIT_SPEED = 400; // Speed of the ball after being hit
const GOAL_PAUSE_DURATION = 2000; // 2 seconds

// Headbutt Mechanic Constants
const HEADBUTT_SPEED_BOOST = 500;
const HEADBUTT_BALL_HIT_SPEED = 800;
const HEADBUTT_DURATION_FRAMES = 10; // ~0.33 seconds
const HEADBUTT_COOLDOWN = 30; // 1 second (30 frames)

// Game State
let gameState = {
    players: {},
    ball: {},
    score: { player1: 0, player2: 0 },
    timeLeft: 60,
    isGameOver: true,
    player1Id: null,
    player2Id: null,
    winner: null,
    isPausedForGoal: false,
    kickOff: true,
    goalScoredBy: null
};
let gameInterval, timerInterval;

// --- Game Management ---
function startGame(duration = 60) {
    const playerIds = Object.keys(gameState.players);
    if (playerIds.length < 2) return;

    console.log(`Starting game with duration: ${duration}s`);

    gameState.player1Id = playerIds[0];
    gameState.player2Id = playerIds[1];

    Object.keys(gameState.players).forEach(id => {
        const isP1 = id === gameState.player1Id;
        gameState.players[id].body = [ isP1 ? { x: 100, y: CANVAS_HEIGHT / 2 } : { x: CANVAS_WIDTH - 100 - SNAKE_SIZE, y: CANVAS_HEIGHT / 2 }];
        gameState.players[id].direction = 'stop';
        gameState.players[id].length = 4;
        gameState.players[id].hitCooldown = 0;
    });

    gameState.score = { player1: 0, player2: 0 };
    gameState.timeLeft = duration;
    gameState.isGameOver = false;
    gameState.winner = null;
    gameState.isPausedForGoal = false;
    gameState.goalScoredBy = null;
    
    resetBall();

    if (gameInterval) clearInterval(gameInterval);
    if (timerInterval) clearInterval(timerInterval);

    gameInterval = setInterval(gameLoop, 1000 / 30);
    timerInterval = setInterval(() => {
        if (gameState.isGameOver || gameState.isPausedForGoal || gameState.kickOff) {
            return;
        }
        
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

function endGame() {
    gameState.isGameOver = true;
    if (gameState.score.player1 > gameState.score.player2) {
        gameState.winner = gameState.player1Id;
    } else if (gameState.score.player2 > gameState.score.player1) {
        gameState.winner = gameState.player2Id;
    } else {
        gameState.winner = 'draw';
    }
    io.emit('gameOver', { score: gameState.score, winner: gameState.winner });
    clearInterval(gameInterval);
    clearInterval(timerInterval);
}

function createPlayer(id, color) {
    let playerRole = !gameState.player1Id ? 'player1' : 'player2';
    return {
        id: id,
        body: [{
            x: playerRole === 'player1' ? 100 : CANVAS_WIDTH - 100 - SNAKE_SIZE,
            y: CANVAS_HEIGHT / 2
        }],
        direction: 'stop',
        color: color,
        length: 4,
        hitCooldown: 0,
        headbuttActive: 0,
        headbuttCooldown: 0
    };
}

// --- Game Loop and Physics ---
function gameLoop() {
    if (gameState.isGameOver) return;

    // Update player states (cooldowns, etc.)
    for (const player of Object.values(gameState.players)) {
        if (player.headbuttCooldown > 0) player.headbuttCooldown--;
        if (player.headbuttActive > 0) player.headbuttActive--;
    }

    if (!gameState.isPausedForGoal) {
        Object.values(gameState.players).forEach(moveSnake);
        updateBallPosition();
        checkCollisions();
    }
    
    io.emit('gameState', gameState);
}

function moveSnake(player) {
    if (player.direction === 'stop') return;

    const head = { ...player.body[0] };
    const speed = player.headbuttActive > 0 ? HEADBUTT_SPEED_BOOST : SNAKE_SPEED;
    const speedPerFrame = speed / 30;

    switch (player.direction) {
        case 'up': head.y -= speedPerFrame; break;
        case 'down': head.y += speedPerFrame; break;
        case 'left': head.x -= speedPerFrame; break;
        case 'right': head.x += speedPerFrame; break;
    }

    // Snake wall collision
    if (head.x < 0) head.x = 0;
    if (head.x + SNAKE_SIZE > CANVAS_WIDTH) head.x = CANVAS_WIDTH - SNAKE_SIZE;
    if (head.y < 0) head.y = 0;
    if (head.y + SNAKE_SIZE > CANVAS_HEIGHT) head.y = CANVAS_HEIGHT - SNAKE_SIZE;

    player.body.unshift(head);
    while (player.body.length > player.length) {
        player.body.pop();
    }
}

function updateBallPosition() {
    if (gameState.kickOff || gameState.isPausedForGoal) return;

    const { ball } = gameState;
    const dt = 1 / 30;

    ball.vx *= BALL_FRICTION;
    ball.vy *= BALL_FRICTION;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const goalYStart = (CANVAS_HEIGHT - GOAL_HEIGHT) / 2;
    const goalYEnd = goalYStart + GOAL_HEIGHT;
    const ballInGoalZoneY = ball.y > goalYStart && ball.y < goalYEnd;

    // --- Wall and Goal Physics ---

    // Left side
    if (ball.x - ball.size < 0) {
        if (ballInGoalZoneY) {
            // In goal mouth, check for score
            if (ball.x + ball.size < 0) {
                handleGoal('player2');
                return;
            }
            // Otherwise, let it pass (no bounce)
        } else {
            // Hit wall outside goal, so bounce
            ball.x = ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    }
    // Right side
    else if (ball.x + ball.size > CANVAS_WIDTH) {
        if (ballInGoalZoneY) {
            // In goal mouth, check for score
            if (ball.x - ball.size > CANVAS_WIDTH) {
                handleGoal('player1');
                return;
            }
            // Otherwise, let it pass (no bounce)
        } else {
            // Hit wall outside goal, so bounce
            ball.x = CANVAS_WIDTH - ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    }

    // Top and bottom walls
    if (ball.y - ball.size < 0) {
        ball.y = ball.size;
        ball.vy *= -BOUNCE_ENERGY_LOSS;
    } else if (ball.y + ball.size > CANVAS_HEIGHT) {
        ball.y = CANVAS_HEIGHT - ball.size;
        ball.vy *= -BOUNCE_ENERGY_LOSS;
    }
}

function checkCollisions() {
    // Snake-ball collision
    for (const id in gameState.players) {
        const player = gameState.players[id];
        if (player.hitCooldown > 0) {
            player.hitCooldown--;
        }
        const head = player.body[0];
        const ball = gameState.ball;
        const headCenterX = head.x + SNAKE_SIZE / 2;
        const headCenterY = head.y + SNAKE_SIZE / 2;

        const dist = Math.hypot(headCenterX - ball.x, headCenterY - ball.y);

        if (dist < SNAKE_SIZE / 2 + ball.size && player.hitCooldown === 0) {
            if (gameState.kickOff) {
                gameState.kickOff = false;
            }
            player.hitCooldown = HIT_COOLDOWN_FRAMES;

            const angle = Math.atan2(ball.y - headCenterY, ball.x - headCenterX);

            // If snake is stopped, ball bounces off it
            if (player.direction === 'stop') {
                const currentSpeed = Math.hypot(ball.vx, ball.vy);
                ball.vx = Math.cos(angle) * currentSpeed * BOUNCE_ENERGY_LOSS;
                ball.vy = Math.sin(angle) * currentSpeed * BOUNCE_ENERGY_LOSS;
            } else { // If snake is moving, it hits the ball
                const hitSpeed = player.headbuttActive > 0 ? HEADBUTT_BALL_HIT_SPEED : BALL_HIT_SPEED;
                ball.vx = Math.cos(angle) * hitSpeed;
                ball.vy = Math.sin(angle) * hitSpeed;
            }
        }
    }
}

function handleGoal(scorer) {
    if (scorer === 'player1') {
        gameState.score.player1++;
    } else {
        gameState.score.player2++;
    }
    gameState.goalScoredBy = scorer;
    gameState.isPausedForGoal = true;
    
    io.emit('gameState', gameState);
    
    setTimeout(() => {
        resetBall();
        io.emit('gameState', gameState);
    }, GOAL_PAUSE_DURATION);
}

function resetBall() {
    gameState.isPausedForGoal = false;
    gameState.goalScoredBy = null;
    gameState.kickOff = true;

    gameState.ball = {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        size: BALL_SIZE,
        vx: 0,
        vy: 0,
    };

    Object.values(gameState.players).forEach(player => {
        const isP1 = player.id === gameState.player1Id;
        player.body = [ isP1 ? { x: 100, y: CANVAS_HEIGHT / 2 } : { x: CANVAS_WIDTH - 100 - SNAKE_SIZE, y: CANVAS_HEIGHT / 2 }];
        player.direction = 'stop';
    });
}

// --- Socket.IO Connection Handling ---
app.use(express.static(path.join(__dirname, '../')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    if (Object.keys(gameState.players).length >= 2) {
        socket.emit('gameFull');
        socket.disconnect();
        return;
    }

    const color = !gameState.player1Id ? '#FF4136' : '#0074D9';
    const newPlayer = createPlayer(socket.id, color);
    gameState.players[socket.id] = newPlayer;

    if (!gameState.player1Id) {
        gameState.player1Id = socket.id;
    } else if (!gameState.player2Id) {
        gameState.player2Id = socket.id;
    }

    console.log(`Player ${Object.keys(gameState.players).length} connected. Total: ${Object.keys(gameState.players).length}`);
    
    io.emit('gameState', gameState);

    socket.on('directionChange', (data) => {
        const player = gameState.players[socket.id];
        if (player) {
            const newDir = data.direction;

            // Headbutt logic: if pressing same direction and cooldown is over
            if (newDir === player.direction && player.headbuttCooldown === 0) {
                player.headbuttActive = HEADBUTT_DURATION_FRAMES;
                player.headbuttCooldown = HEADBUTT_COOLDOWN;
                return; // Don't change direction, just activate headbutt
            }

            // Prevent 180-degree turns
            if ((player.direction === 'up' && newDir === 'down') ||
                (player.direction === 'down' && newDir === 'up') ||
                (player.direction === 'left' && newDir === 'right') ||
                (player.direction === 'right' && newDir === 'left')) {
                return;
            }
            
            player.direction = newDir;
        }
    });

    socket.on('requestRestart', ({ duration }) => {
        if (gameState.isGameOver) {
            startGame(duration);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        if (!gameState.players[socket.id]) return;

        delete gameState.players[socket.id];

        if (gameState.player1Id === socket.id) gameState.player1Id = null;
        if (gameState.player2Id === socket.id) gameState.player2Id = null;
        
        if (Object.keys(gameState.players).length < 2 && !gameState.isGameOver) {
            endGame();
        }
        
        io.emit('gameState', gameState);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});