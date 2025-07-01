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

function createInitialState() {
    return {
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
}

function createPlayer(id, color, team) {
    return {
        id: id,
        body: [{
            x: team === 'player1' ? 100 : CANVAS_WIDTH - 100 - SNAKE_SIZE,
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

function addPlayer(gameState, playerId) {
    let team;
    let color;
    if (!gameState.player1Id) {
        team = 'player1';
        color = '#FF4136'; // Red
        gameState.player1Id = playerId;
    } else {
        team = 'player2';
        color = '#0074D9'; // Blue
        gameState.player2Id = playerId;
    }
    gameState.players[playerId] = createPlayer(playerId, color, team);
    return team;
}

function removePlayer(gameState, playerId) {
    if (gameState.player1Id === playerId) gameState.player1Id = null;
    if (gameState.player2Id === playerId) gameState.player2Id = null;
    delete gameState.players[playerId];
}

function startGame(gameState, onUpdate, onEnd, intervals, duration = 60) {
    console.log(`Starting game with duration: ${duration}s`);

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
    
    resetBall(gameState);

    if (intervals.game) clearInterval(intervals.game);
    if (intervals.timer) clearInterval(intervals.timer);

    intervals.game = setInterval(() => gameLoop(gameState, onUpdate, onEnd), 1000 / 30);
    intervals.timer = setInterval(() => {
        if (gameState.isGameOver || gameState.isPausedForGoal || gameState.kickOff) {
            return;
        }
        
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
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

    if (head.x < 0) head.x = 0;
    if (head.x + SNAKE_SIZE > CANVAS_WIDTH) head.x = CANVAS_WIDTH - SNAKE_SIZE;
    if (head.y < 0) head.y = 0;
    if (head.y + SNAKE_SIZE > CANVAS_HEIGHT) head.y = CANVAS_HEIGHT - SNAKE_SIZE;

    player.body.unshift(head);
    while (player.body.length > player.length) {
        player.body.pop();
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

    if (ball.x - ball.size < 0) {
        if (ballInGoalZoneY && ball.x + ball.size < 0) {
            onGoal('player2');
            return;
        } else if (!ballInGoalZoneY) {
            ball.x = ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    } else if (ball.x + ball.size > CANVAS_WIDTH) {
        if (ballInGoalZoneY && ball.x - ball.size > CANVAS_WIDTH) {
            onGoal('player1');
            return;
        } else if (!ballInGoalZoneY) {
            ball.x = CANVAS_WIDTH - ball.size;
            ball.vx *= -BOUNCE_ENERGY_LOSS;
        }
    }

    if (ball.y - ball.size < 0) {
        ball.y = ball.size;
        ball.vy *= -BOUNCE_ENERGY_LOSS;
    } else if (ball.y + ball.size > CANVAS_HEIGHT) {
        ball.y = CANVAS_HEIGHT - ball.size;
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

            const angle = Math.atan2(ball.y - headCenterY, ball.x - headCenterX);
            const hitSpeed = player.headbuttActive > 0 ? HEADBUTT_BALL_HIT_SPEED : BALL_HIT_SPEED;
            ball.vx = Math.cos(angle) * hitSpeed;
            ball.vy = Math.sin(angle) * hitSpeed;
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
