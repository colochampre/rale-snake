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

function createInitialState(duration = 300, mode = '1vs1') {
    return {
        players: {},
        ball: {},
        score: { team1: 0, team2: 0 },
        teams: { team1: [], team2: [] },
        mode: mode,
        timeLeft: duration,
        isGameOver: true,
        gameStarted: false,
        winner: null,
        isPausedForGoal: false,
        kickOff: true,
        goalScoredBy: null,
        lastTouchedBy: { team1: null, team2: null }, // Tracks the last player to touch the ball for each team
        playerMatchStats: {} // Tracks stats for the current match
    };
}

function createPlayer(id, color, team, username) {
    return {
        id: id,
        username: username,
        body: [], // Initial position will be set in startGame/resetBall
        direction: 'stop',
        color: color,
        team: team,
        length: 4,
        hitCooldown: 0,
        headbuttActive: 0,
        headbuttCooldown: 0,
        isMoving: false,
        isReady: false
    };
}

function addPlayer(gameState, playerId, username) {
    const team1Count = gameState.teams.team1.length;
    const team2Count = gameState.teams.team2.length;

    let assignedTeam;
    if (team1Count <= team2Count) {
        assignedTeam = 'team1';
        gameState.teams.team1.push(playerId);
    } else {
        assignedTeam = 'team2';
        gameState.teams.team2.push(playerId);
    }

    const color = assignedTeam === 'team1' ? '#FF4136' : '#0074D9';
    gameState.players[playerId] = createPlayer(playerId, color, assignedTeam, username);
    
    // Initialize stats for the player for the current match
    gameState.playerMatchStats[playerId] = {
        username: username,
        goals: 0,
        touches: 0
    };

    return assignedTeam;
}

function removePlayer(gameState, playerId) {
    gameState.teams.team1 = gameState.teams.team1.filter(id => id !== playerId);
    gameState.teams.team2 = gameState.teams.team2.filter(id => id !== playerId);
    delete gameState.players[playerId];
}

function startGame(gameState, onUpdate, onEnd, intervals) {
    console.log(`Starting game with duration: ${gameState.timeLeft}s`);

    Object.values(gameState.players).forEach(player => {
        const isTeam1 = gameState.teams.team1.includes(player.id);
        // Distribute players vertically on their side of the field
        const teamPlayers = isTeam1 ? gameState.teams.team1 : gameState.teams.team2;
        const playerIndex = teamPlayers.indexOf(player.id);
        const numPlayersOnTeam = teamPlayers.length;
        const yPos = (CANVAS_HEIGHT / (numPlayersOnTeam + 1)) * (playerIndex + 1);

        player.body = [{
            x: isTeam1 ? 100 : CANVAS_WIDTH - 100 - SNAKE_SIZE,
            y: yPos
        }];
        player.direction = 'stop';
        player.length = 4;
        player.hitCooldown = 0;
    });

    gameState.score = { team1: 0, team2: 0 };
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
        if (gameState.timeLeft <= 0) {
            const finalState = endGame(gameState, 'time');
            onEnd(finalState);
        }
    }, 1000);
}

function endGame(gameState, reason) {
    if (gameState.isGameOver) return gameState; // Prevent ending twice

    gameState.isGameOver = true;

    if (reason === 'time') {
        if (gameState.score.team1 > gameState.score.team2) {
            gameState.winner = 'team1';
        } else if (gameState.score.team2 > gameState.score.team1) {
            gameState.winner = 'team2';
        } else {
            gameState.winner = 'draw';
        }
    }
    
    return gameState;
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
                onGoal('team2');
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
                onGoal('team1');
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

        const ball = gameState.ball;

        for (const segment of player.body) {
            const segmentCenterX = segment.x + SNAKE_SIZE / 2;
            const segmentCenterY = segment.y + SNAKE_SIZE / 2;

            const dist = Math.hypot(segmentCenterX - ball.x, segmentCenterY - ball.y);

            if (dist < SNAKE_SIZE / 2 + ball.size && player.hitCooldown === 0) {
                if (gameState.kickOff) gameState.kickOff = false;
                player.hitCooldown = HIT_COOLDOWN_FRAMES;

                // --- Stats Tracking ---
                gameState.lastTouchedBy[player.team] = player.id;
                if (gameState.playerMatchStats[player.id]) {
                    gameState.playerMatchStats[player.id].touches++;
                }
                // --------------------

                const isHead = player.body.indexOf(segment) === 0;

                if (!player.isMoving || !isHead) {
                    // Simplified bounce logic for stationary snake or body segments
                    const normalX = ball.x - segmentCenterX;
                    const normalY = ball.y - segmentCenterY;
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
                    // Headbutt logic only for the head
                    const angle = Math.atan2(ball.y - segmentCenterY, ball.x - segmentCenterX);
                    const hitSpeed = player.headbuttActive > 0 ? HEADBUTT_BALL_HIT_SPEED : BALL_HIT_SPEED;
                    ball.vx = Math.cos(angle) * hitSpeed;
                    ball.vy = Math.sin(angle) * hitSpeed;
                }
                // Break the inner loop to prevent multiple collisions with the same snake in one frame
                break;
            }
        }
    }
}

function handleGoal(gameState, scoringTeam, onUpdate) {
    // --- Stats Tracking ---
    // A goal is awarded to the last player on the scoring team to touch the ball.
    // This prevents own goals from counting towards a player's stats.
    const scorerPlayerId = gameState.lastTouchedBy[scoringTeam];
    if (scorerPlayerId && gameState.playerMatchStats[scorerPlayerId]) {
        gameState.playerMatchStats[scorerPlayerId].goals++;
    }
    // --------------------

    if (scoringTeam === 'team1') {
        gameState.score.team1++;
    } else {
        gameState.score.team2++;
    }
    gameState.goalScoredBy = scoringTeam;
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
    gameState.lastTouchedBy = { team1: null, team2: null }; // Reset last touched

    gameState.ball = {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        size: BALL_SIZE,
        vx: 0,
        vy: 0,
    };

    Object.values(gameState.players).forEach(player => {
        const isTeam1 = gameState.teams.team1.includes(player.id);
        const teamPlayers = isTeam1 ? gameState.teams.team1 : gameState.teams.team2;
        const playerIndex = teamPlayers.indexOf(player.id);
        const numPlayersOnTeam = teamPlayers.length;
        const yPos = (CANVAS_HEIGHT / (numPlayersOnTeam + 1)) * (playerIndex + 1);

        player.body = [{
            x: isTeam1 ? 100 : CANVAS_WIDTH - 100 - SNAKE_SIZE,
            y: yPos
        }];
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
