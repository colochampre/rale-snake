// Game Constants
const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 660;
const FIELD_WIDTH = 800;
const FIELD_HEIGHT = 600;
const SNAKE_SIZE = 20;
const SNAKE_SPEED = 300; // Pixels per second
const BALL_SIZE = 15;
const BALL_FRICTION = 0.97; // Lower = more friction
const BALL_HIT_SPEED = 400; // Speed of the ball after being hit
const BOUNCE_ENERGY_LOSS = 0.8;
const HIT_COOLDOWN_FRAMES = 4;
const GOAL_HEIGHT = 150;
const GOAL_PAUSE_DURATION = 2000; // 2 seconds

// Headbutt Mechanic Constants
const HEADBUTT_SPEED_BOOST = 500;
const HEADBUTT_BALL_HIT_SPEED = 800;
const HEADBUTT_DURATION_FRAMES = 10; // ~0.33 seconds
const HEADBUTT_COOLDOWN = 30; // 1 second (30 frames)

function createInitialState(duration = 300) { // Default to 5 minutes
    return {
        players: {},
        ball: {},
        score: { player1: 0, player2: 0 },
        timeLeft: duration,
        isGameOver: true,
        gameStarted: false, // Distinguish between lobby and active game
        player1Id: null,
        player2Id: null,
        winner: null,
        isPausedForGoal: false,
        kickOff: true,
        goalScoredBy: null
    };
}

function createPlayer(id, color, team, username) {
    return {
        id: id,
        username: username,
        body: [{
            x: team === 'player1' ? 100 : CANVAS_WIDTH - 100 - SNAKE_SIZE,
            y: CANVAS_HEIGHT / 2
        }],
        direction: 'stop',
        color: color,
        length: 4,
        hitCooldown: 0,
        headbuttActive: 0,
        headbuttCooldown: 0,
        isMoving: false,
        isReady: false // Player is not ready by default
    };
}

function addPlayer(gameState, playerId, username) {
    let playerTeam;
    let color;
    if (!gameState.player1Id) {
        playerTeam = 'player1';
        color = '#FF4136'; // Red
        gameState.player1Id = playerId;
    } else {
        playerTeam = 'player2';
        color = '#0074D9'; // Blue
        gameState.player2Id = playerId;
    }
    gameState.players[playerId] = createPlayer(playerId, color, playerTeam, username);
    return playerTeam;
}

function removePlayer(gameState, playerId) {
    if (gameState.player1Id === playerId) gameState.player1Id = null;
    if (gameState.player2Id === playerId) gameState.player2Id = null;
    delete gameState.players[playerId];
}

function startGame(gameState, onUpdate, onEnd, intervals) {
    console.log(`Starting game with duration: ${gameState.timeLeft}s`);

    Object.keys(gameState.players).forEach(id => {
        const isP1 = id === gameState.player1Id;
        gameState.players[id].body = [ isP1 ? { x: 100, y: CANVAS_HEIGHT / 2 } : { x: CANVAS_WIDTH - 100 - SNAKE_SIZE, y: CANVAS_HEIGHT / 2 }];
        gameState.players[id].direction = 'stop';
        gameState.players[id].length = 4;
        gameState.players[id].hitCooldown = 0;
    });

    gameState.score = { player1: 0, player2: 0 };
    gameState.isGameOver = false;
    gameState.gameStarted = true;
    gameState.winner = null;
    gameState.isPausedForGoal = false;
    gameState.goalScoredBy = null;
    
    resetBall(gameState);

    if (intervals.game) clearInterval(intervals.game);
    if (intervals.timer) clearInterval(intervals.timer);

    intervals.game = setInterval(() => gameLoop(gameState, onUpdate, onEnd), 1000 / 30);
    intervals.timer = setInterval(() => {
        if (gameState.isGameOver || gameState.isPausedForGoal || gameState.kickOff) {
            return;
        }
        
        gameState.timeLeft--;
        if (gameState.timeLeft < 0) {
            endGame(gameState, 'time');
            onEnd({ score: gameState.score, winner: gameState.winner });
        }
    }, 1000);
}

function endGame(gameState, reason) {
    gameState.isGameOver = true;
    if (reason !== 'disconnect') {
        if (gameState.score.player1 > gameState.score.player2) {
            gameState.winner = 'player1';
        } else if (gameState.score.player2 > gameState.score.player1) {
            gameState.winner = 'player2';
        } else {
            gameState.winner = 'draw';
        }
    } else {
        // Handle disconnect winner logic if necessary
        const remainingPlayer = Object.keys(gameState.players)[0];
        if (remainingPlayer) {
            gameState.winner = gameState.player1Id === remainingPlayer ? 'player1' : 'player2';
        }
    }
}

function gameLoop(gameState, onUpdate, onEnd) {
    if (gameState.isGameOver) return;

    for (const player of Object.values(gameState.players)) {
        if (player.headbuttCooldown > 0) player.headbuttCooldown--;
        if (player.headbuttActive > 0) player.headbuttActive--;
    }

    if (!gameState.isPausedForGoal) {
        Object.values(gameState.players).forEach(player => moveSnake(gameState, player));
        updateBallPosition(gameState, (scorer) => {
            handleGoal(gameState, scorer, onUpdate);
        });
        checkCollisions(gameState);
    }
    
    onUpdate(gameState);
}

function moveSnake(gameState, player) {
    const oldHead = { ...player.body[0] };
    const head = { ...player.body[0] };
    const speed = (player.headbuttActive > 0 ? HEADBUTT_SPEED_BOOST : SNAKE_SPEED) / 30; // Speed per frame

    let moved = true;
    switch (player.direction) {
        case 'up': head.y -= speed; break;
        case 'down': head.y += speed; break;
        case 'left': head.x -= speed; break;
        case 'right': head.x += speed; break;
        default: moved = false; break;
    }

    // Wall collision
    if (head.x < 0) head.x = 0;
    if (head.x > CANVAS_WIDTH - SNAKE_SIZE) head.x = CANVAS_WIDTH - SNAKE_SIZE;
    if (head.y < 0) head.y = 0;
    if (head.y > CANVAS_HEIGHT - SNAKE_SIZE) head.y = CANVAS_HEIGHT - SNAKE_SIZE;

    player.isMoving = head.x !== oldHead.x || head.y !== oldHead.y;

    if (moved) {
        player.body.unshift(head);
        if (player.body.length > player.length) {
            player.body.pop();
        }
    }
}

function updateBallPosition(gameState, onGoal) {
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

    const fieldX_start = (CANVAS_WIDTH - FIELD_WIDTH) / 2;
    const fieldX_end = fieldX_start + FIELD_WIDTH;
    const fieldY_start = (CANVAS_HEIGHT - FIELD_HEIGHT) / 2;
    const fieldY_end = fieldY_start + FIELD_HEIGHT;

    // Left wall
    if (ball.x - ball.size < fieldX_start) {
        if (ballInGoalZoneY) {
            if (ball.x - ball.size < 0) { // Goal line
                onGoal('player2');
                return;
            }
        } else {
            ball.x = fieldX_start + ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    } 
    // Right wall
    else if (ball.x + ball.size > fieldX_end) {
        if (ballInGoalZoneY) {
            if (ball.x + ball.size > CANVAS_WIDTH) { // Goal line
                onGoal('player1');
                return;
            }
        } else {
            ball.x = fieldX_end - ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    }

    // Top wall
    if (ball.y - ball.size < fieldY_start) {
        ball.y = fieldY_start + ball.size;
        ball.vy *= -BOUNCE_ENERGY_LOSS;
    } 
    // Bottom wall
    else if (ball.y + ball.size > fieldY_end) {
        ball.y = fieldY_end - ball.size;
        ball.vy *= -BOUNCE_ENERGY_LOSS;
    }
}

function checkCollisions(gameState) {
    for (const id in gameState.players) {
        const player = gameState.players[id];
        if (player.hitCooldown > 0) player.hitCooldown--;

        const head = player.body[0];
        const ball = gameState.ball;
        const headCenterX = head.x + SNAKE_SIZE / 2;
        const headCenterY = head.y + SNAKE_SIZE / 2;

        const dist = Math.hypot(headCenterX - ball.x, headCenterY - ball.y);

        if (dist < SNAKE_SIZE / 2 + ball.size && player.hitCooldown === 0) {
            if (gameState.kickOff) gameState.kickOff = false;
            player.hitCooldown = HIT_COOLDOWN_FRAMES;

            if (!player.isMoving) {
                // Simplified bounce logic for stationary snake
                const normalX = ball.x - headCenterX;
                const normalY = ball.y - headCenterY;
                const norm = Math.hypot(normalX, normalY) || 1;
                const nx = normalX / norm;
                const ny = normalY / norm;

                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dot * nx) * BOUNCE_ENERGY_LOSS;
                ball.vy = (ball.vy - 2 * dot * ny) * BOUNCE_ENERGY_LOSS;
                
                const overlap = (SNAKE_SIZE / 2 + ball.size) - dist;
                ball.x += nx * (overlap + 1);
                ball.y += ny * (overlap + 1);
            } else {
                const angle = Math.atan2(ball.y - headCenterY, ball.x - headCenterX);
                const hitSpeed = player.headbuttActive > 0 ? HEADBUTT_BALL_HIT_SPEED : BALL_HIT_SPEED;
                ball.vx = Math.cos(angle) * hitSpeed;
                ball.vy = Math.sin(angle) * hitSpeed;
            }
        }
    }
}

function handleGoal(gameState, scorer, onUpdate) {
    if (scorer === 'player1') {
        gameState.score.player1++;
    } else {
        gameState.score.player2++;
    }
    gameState.goalScoredBy = scorer;
    gameState.isPausedForGoal = true;
    
    onUpdate(gameState);
    
    setTimeout(() => {
        resetBall(gameState);
        onUpdate(gameState);
    }, GOAL_PAUSE_DURATION);
}

function resetBall(gameState) {
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

function handleDirectionChange(gameState, playerId, direction) {
    const player = gameState.players[playerId];
    if (!player) return;

    const newDir = direction;

    if (newDir === player.direction && player.headbuttCooldown === 0) {
        player.headbuttActive = HEADBUTT_DURATION_FRAMES;
        player.headbuttCooldown = HEADBUTT_COOLDOWN;
        return;
    }

    if ((player.direction === 'up' && newDir === 'down') ||
        (player.direction === 'down' && newDir === 'up') ||
        (player.direction === 'left' && newDir === 'right') ||
        (player.direction === 'right' && newDir === 'left')) {
        return;
    }
    
    player.direction = newDir;
}

module.exports = {
    createInitialState,
    addPlayer,
    removePlayer,
    startGame,
    endGame,
    handleDirectionChange
};
