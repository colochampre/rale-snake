document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI Elements
    const scoreDiv = document.getElementById('score');
    const timerDiv = document.getElementById('timer');
    const preGameScreen = document.getElementById('preGame');
    const gameOverScreen = document.getElementById('gameOver');
    const goalMessage = document.getElementById('goalMessage');
    const timeSelectionDiv = document.getElementById('timeSelection');
    const startGameButton = document.getElementById('startGameButton');
    const waitingMessage = document.getElementById('waitingMessage');
    const winnerText = document.getElementById('winnerText');
    const finalScoreText = document.getElementById('finalScoreText');
    const restartButton = document.getElementById('restartButton');

    // Game Constants
    const SNAKE_SIZE = 20;
    const GOAL_HEIGHT = 150;
    const MARGIN = 30;
    const FIELD_WIDTH = canvas.width - MARGIN * 2;
    const FIELD_HEIGHT = canvas.height - MARGIN * 2;

    // Local State
    let localState = {};

    // --- Drawing Functions ---
    function drawField() {
        ctx.save();
        ctx.translate(MARGIN, MARGIN);

        const goalYStart = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;
        const goalYEnd = goalYStart + GOAL_HEIGHT;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;

        // --- Draw Border with Goal Gaps ---
        ctx.beginPath();
        // Top border
        ctx.moveTo(0, 0);
        ctx.lineTo(FIELD_WIDTH, 0);
        // Bottom border
        ctx.moveTo(0, FIELD_HEIGHT);
        ctx.lineTo(FIELD_WIDTH, FIELD_HEIGHT);
        // Left border (top part)
        ctx.moveTo(0, 0);
        ctx.lineTo(0, goalYStart);
        // Left border (bottom part)
        ctx.moveTo(0, goalYEnd);
        ctx.lineTo(0, FIELD_HEIGHT);
        // Right border (top part)
        ctx.moveTo(FIELD_WIDTH, 0);
        ctx.lineTo(FIELD_WIDTH, goalYStart);
        // Right border (bottom part)
        ctx.moveTo(FIELD_WIDTH, goalYEnd);
        ctx.lineTo(FIELD_WIDTH, FIELD_HEIGHT);
        ctx.stroke();

        // Center line
        ctx.beginPath();
        ctx.moveTo(FIELD_WIDTH / 2, 0);
        ctx.lineTo(FIELD_WIDTH / 2, FIELD_HEIGHT);
        ctx.stroke();

        // Center circle
        ctx.beginPath();
        ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }

    function drawGoals() {
        const goalY = (canvas.height - GOAL_HEIGHT) / 2;

        // Left Goal (Red)
        ctx.fillStyle = 'rgba(255, 65, 54, 0.2)';
        ctx.fillRect(0, goalY, MARGIN, GOAL_HEIGHT);
        ctx.strokeStyle = '#FF4136';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, goalY, MARGIN, GOAL_HEIGHT);

        // Right Goal (Blue)
        ctx.fillStyle = 'rgba(0, 116, 217, 0.2)';
        ctx.fillRect(canvas.width - MARGIN, goalY, MARGIN, GOAL_HEIGHT);
        ctx.strokeStyle = '#0074D9';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width - MARGIN, goalY, MARGIN, GOAL_HEIGHT);
    }

    function drawPlayers(players) {
        ctx.save();
        ctx.translate(MARGIN, MARGIN);
        for (const id in players) {
            const player = players[id];
            ctx.fillStyle = player.color;
            player.body.forEach(segment => {
                ctx.fillRect(segment.x, segment.y, SNAKE_SIZE, SNAKE_SIZE);
            });
        }
        ctx.restore();
    }

    function drawBall(ball) {
        if (ball && ball.x) {
            ctx.save();
            ctx.translate(MARGIN, MARGIN);
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // --- Main Drawing Loop ---
    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawField();
        drawGoals();

        if (localState && !localState.isGameOver) {
            drawPlayers(localState.players);
            drawBall(localState.ball);
        }
        requestAnimationFrame(loop);
    }

    // --- UI Update Functions ---
    function updateUI(state) {
        // Update score and timer
        scoreDiv.textContent = `Rojo: ${state.score.player1} - Azul: ${state.score.player2}`;
        timerDiv.textContent = `Tiempo: ${state.timeLeft}`;

        // Control UI visibility
        preGameScreen.classList.toggle('hidden', !state.isGameOver);
        gameOverScreen.classList.add('hidden'); // Handled by 'gameOver' event
        goalMessage.classList.toggle('hidden', !state.isPausedForGoal);

        if (state.isPausedForGoal) {
            const scorerColor = state.goalScoredBy === 'player1' ? 'Rojo' : 'Azul';
            goalMessage.textContent = `¡Gol del equipo ${scorerColor}!`;
            goalMessage.style.color = scorerColor === 'Rojo' ? '#FF4136' : '#0074D9';
        }

        // Handle waiting message and start button
        const playerCount = Object.keys(state.players).length;
        startGameButton.disabled = playerCount < 2;
        waitingMessage.classList.toggle('hidden', playerCount >= 2);
    }

    // --- Event Listeners ---
    document.addEventListener('keydown', e => {
        let direction = null;
        switch (e.key) {
            case 'ArrowUp': direction = 'up'; break;
            case 'ArrowDown': direction = 'down'; break;
            case 'ArrowLeft': direction = 'left'; break;
            case 'ArrowRight': direction = 'right'; break;
        }
        if (direction) socket.emit('directionChange', { direction });
    });

    timeSelectionDiv.addEventListener('click', e => {
        if (e.target.classList.contains('time-btn')) {
            document.querySelector('.time-btn.selected').classList.remove('selected');
            e.target.classList.add('selected');
        }
    });

    startGameButton.addEventListener('click', () => {
        const selectedTime = document.querySelector('.time-btn.selected').dataset.time;
        socket.emit('requestRestart', { duration: parseInt(selectedTime, 10) });
    });

    restartButton.addEventListener('click', () => {
        gameOverScreen.classList.add('hidden');
        preGameScreen.classList.remove('hidden');
    });

    // --- Socket.IO Handlers ---
    socket.on('gameState', (newState) => {
        localState = newState;
        updateUI(newState);
    });

    socket.on('gameOver', (data) => {
        localState.isGameOver = true;
        let message = 'Game Over!';
        if (data.winner === 'draw') {
            message = "It's a Draw!";
        } else if (data.winner) {
            const winnerColor = localState.players[data.winner]?.color === '#FF4136' ? 'Rojo' : 'Azul';
            message = `¡Gana el equipo ${winnerColor}!`;
        }
        winnerText.textContent = message;
        finalScoreText.textContent = `Puntuación Final: ${data.score.player1} - ${data.score.player2}`;
        
        gameOverScreen.classList.remove('hidden');
        preGameScreen.classList.add('hidden');
        goalMessage.classList.add('hidden');
    });
    
    // Start drawing loop
    loop();
});
