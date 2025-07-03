document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // --- UI Elements ---
    const loginContainer = document.getElementById('login-container');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');
    const mainContainer = document.getElementById('main-container');
    const profileUsername = document.getElementById('profile-username');
    const logoutBtn = document.getElementById('logoutBtn');

    const scoreDiv = document.getElementById('score');
    const timerDiv = document.getElementById('timer');
    const gameOverScreen = document.getElementById('gameOver');
    const goalMessage = document.getElementById('goalMessage');
    const winnerText = document.getElementById('winnerText');
    const finalScoreText = document.getElementById('finalScoreText');
    const restartButton = document.getElementById('restartButton');
    const countdown = document.getElementById('countdown');
    const countdownText = document.getElementById('countdownText');

    // Lobby UI Elements
    const lobbyContainer = document.getElementById('lobby-container');
    const roomNameInput = document.getElementById('roomNameInput');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomsDiv = document.getElementById('rooms');
    const roomDurationSelect = document.getElementById('roomDurationSelect');

    // Current Room UI
    const currentRoomContainer = document.getElementById('current-room-container');
    const currentRoomName = document.getElementById('currentRoomName');
    const roomPlayersDiv = document.getElementById('room-players');
    const readyBtn = document.getElementById('readyBtn');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');

    // Game Constants
    const SNAKE_SIZE = 20;
    const GOAL_HEIGHT = 150;
    const MARGIN = 30;
    const FIELD_WIDTH = canvas.width - MARGIN * 2;
    const FIELD_HEIGHT = canvas.height - MARGIN * 2;

    // Local State
    let localState = {};
    let gameStarted = false;

    // --- Drawing Functions ---
    function drawField() {
        ctx.save();
        ctx.translate(MARGIN, MARGIN);
        const goalYStart = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;
        const goalYEnd = goalYStart + GOAL_HEIGHT;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(FIELD_WIDTH, 0);
        ctx.moveTo(0, FIELD_HEIGHT); ctx.lineTo(FIELD_WIDTH, FIELD_HEIGHT);
        ctx.moveTo(0, 0); ctx.lineTo(0, goalYStart);
        ctx.moveTo(0, goalYEnd); ctx.lineTo(0, FIELD_HEIGHT);
        ctx.moveTo(FIELD_WIDTH, 0); ctx.lineTo(FIELD_WIDTH, goalYStart);
        ctx.moveTo(FIELD_WIDTH, goalYEnd); ctx.lineTo(FIELD_WIDTH, FIELD_HEIGHT);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(FIELD_WIDTH / 2, 0); ctx.lineTo(FIELD_WIDTH / 2, FIELD_HEIGHT);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 80, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawGoals() {
        const goalY = (canvas.height - GOAL_HEIGHT) / 2;
        ctx.fillStyle = 'rgba(255, 65, 54, 0.2)';
        ctx.fillRect(0, goalY, MARGIN, GOAL_HEIGHT);
        ctx.strokeStyle = '#FF4136';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, goalY, MARGIN, GOAL_HEIGHT);
        ctx.fillStyle = 'rgba(0, 116, 217, 0.2)';
        ctx.fillRect(canvas.width - MARGIN, goalY, MARGIN, GOAL_HEIGHT);
        ctx.strokeStyle = '#0074D9';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width - MARGIN, goalY, MARGIN, GOAL_HEIGHT);
    }

    function drawPlayers(players) {
        for (const id in players) {
            const player = players[id];
            ctx.fillStyle = player.color;
            player.body.forEach(segment => {
                ctx.fillRect(segment.x, segment.y, SNAKE_SIZE, SNAKE_SIZE);
            });
        }
    }

    function drawBall(ball) {
        if (ball && ball.x) {
            ctx.fillStyle = '#F0F0F0';
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- Main Drawing Loop ---
    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawField();
        drawGoals();

        if (gameStarted && localState.players) {
            drawPlayers(localState.players);
            drawBall(localState.ball);
        }
        requestAnimationFrame(loop);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // --- UI Update Functions ---
    function updateUI(state) {
        scoreDiv.textContent = `${state.score.player1} - ${state.score.player2}`;
        timerDiv.textContent = `Tiempo: ${formatTime(state.timeLeft)}`;
        goalMessage.classList.toggle('hidden', !state.isPausedForGoal);
        if (state.isPausedForGoal) {
            const scorerColor = state.goalScoredBy === 'player1' ? 'Rojo' : 'Azul';
            goalMessage.textContent = `¡Gol del equipo ${scorerColor}!`;
            goalMessage.style.color = scorerColor === 'Rojo' ? '#FF4136' : '#0074D9';
        }
    }

    function updateRoomList(rooms) {
        roomsDiv.innerHTML = '';
        if (Object.keys(rooms).length === 0) {
            roomsDiv.innerHTML = '<p>No hay salas creadas</p>';
            return;
        }

        const isInRoom = Object.values(rooms).some(room => room.players.some(p => p.id === socket.id));

        Object.values(rooms).forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.classList.add('room');

            let buttonHtml = '';
            if (room.owner === socket.id) {
                buttonHtml = `<button data-room-id="${room.id}" data-action="delete">Borrar</button>`;
            } else if (!isInRoom && room.playerCount < room.maxPlayers) {
                buttonHtml = `<button data-room-id="${room.id}" data-action="join">Unirse</button>`;
            }

            roomElement.innerHTML = `
                <span class="room-name">${room.name} (${formatTime(room.duration)})</span>
                <div class="room-info">
                    <span class="room-players">(${room.playerCount}/${room.maxPlayers})</span>
                    ${buttonHtml}
                </div>
            `;
            roomsDiv.appendChild(roomElement);
        });
    }

    function showLobbyView() {
        lobbyContainer.querySelector('#room-actions').classList.remove('hidden');
        lobbyContainer.querySelector('#room-list').classList.remove('hidden');
        currentRoomContainer.classList.add('hidden');
    }

    function showCurrentRoomView(room) {
        lobbyContainer.querySelector('#room-actions').classList.add('hidden');
        lobbyContainer.querySelector('#room-list').classList.add('hidden');
        currentRoomContainer.classList.remove('hidden');
        currentRoomName.textContent = room.name;
        updateRoomPlayers(room.players);
    }

    function updateRoomPlayers(players) {
        roomPlayersDiv.innerHTML = '';
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.classList.add('player-in-room');
            // Use username if available, otherwise fall back to team
            const playerName = player.username || `Jugador ${player.team}`;
            playerElement.textContent = `${playerName} ${player.isReady ? '✅' : '😴'}`;
            playerElement.style.color = player.isReady ? 'lightgreen' : '#F0F0F0';
            roomPlayersDiv.appendChild(playerElement);
        });
    }

    // --- Login and LocalStorage ---
    function loginUser(username) {
        socket.emit('login', { username });
        loginContainer.classList.add('hidden');
        mainContainer.classList.remove('hidden');
        profileUsername.textContent = username;
    }

    loginBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) {
            localStorage.setItem('username', username);
            loginUser(username);
        } else {
            alert('Por favor, ingrese un nombre de usuario.');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('username');
        location.reload();
    });

    // Check for saved username on page load
    const savedUsername = localStorage.getItem('username');
    if (savedUsername) {
        loginUser(savedUsername);
    }

    // --- Other Event Listeners ---

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

    createRoomBtn.addEventListener('click', () => {
        const roomName = roomNameInput.value.trim();
        const duration = parseInt(roomDurationSelect.value, 10);
        if (roomName) {
            socket.emit('createRoom', { name: roomName, duration });
            roomNameInput.value = '';
        }
    });

    roomsDiv.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            const roomId = e.target.dataset.roomId;
            const action = e.target.dataset.action;

            if (action === 'join') {
                socket.emit('joinRoom', { roomId });
            } else if (action === 'delete') {
                socket.emit('deleteRoom', { roomId });
            }
        }
    });

    readyBtn.addEventListener('click', () => {
        socket.emit('playerReady');
    });

    leaveRoomBtn.addEventListener('click', () => {
        socket.emit('leaveRoom');
        showLobbyView();
    });

    restartButton.addEventListener('click', () => {
        gameOverScreen.classList.add('hidden');
        gameStarted = false;
        socket.emit('leaveRoom');
    });

    // --- Socket.IO Handlers ---
    socket.on('roomList', (rooms) => {
        updateRoomList(rooms);
    });

    socket.on('joinedRoom', (room) => {
        showCurrentRoomView(room);
    });

    socket.on('roomUpdate', (room) => {
        updateRoomPlayers(room.players);
    });

    socket.on('gameCountdown', (time) => {
        currentRoomContainer.classList.add('hidden');
        countdown.classList.remove('hidden');
        countdownText.textContent = time;
        if (time === '') {
            countdown.classList.add('hidden');
        }
    });

    socket.on('gameStart', (initialState) => {
        gameStarted = true;
        localState = initialState;
        currentRoomContainer.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        updateUI(initialState);
    });

    socket.on('gameState', (newState) => {
        if (gameStarted) {
            localState = newState;
            updateUI(newState);
        }
    });

    socket.on('gameOver', (data) => {
        gameStarted = false;
        localState.isGameOver = true;
        let message = 'Game Over!';
        if (data.winner === 'draw') {
            message = "It's a Draw!";
        } else if (data.winner) {
            const winnerColor = data.winner === 'player1' ? 'Rojo' : 'Azul';
            message = `¡Gana el equipo ${winnerColor}!`;
        }
        winnerText.textContent = message;
        finalScoreText.textContent = `Puntuación Final: ${data.score.player1} - ${data.score.player2}`;
        
        gameOverScreen.classList.remove('hidden');
        goalMessage.classList.add('hidden');
    });

    socket.on('roomClosed', (message) => {
        alert(message);
        showLobbyView();
    });

    socket.on('showLobby', () => {
        showLobbyView();
        gameOverScreen.classList.add('hidden');
        goalMessage.classList.add('hidden');
    });

    socket.on('error', (message) => {
        alert(message);
    });
    
    // Start drawing loop
    loop();
});
