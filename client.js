document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    window.socket = socket; // Make socket instance globally available
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // --- UI Elements ---
    const loginContainer = document.getElementById('login-container');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');
    const mainContainer = document.getElementById('main-container');
    const profileUsername = document.getElementById('profile-username');
    const rankingBtn = document.getElementById('rankingBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    const scoreBoard = document.getElementById('scoreboard');
    const scoreDiv = document.getElementById('score');
    const timerDiv = document.getElementById('timer');
    const gameOverScreen = document.getElementById('gameOver');
    const goalMessage = document.getElementById('goalMessage');
    const winnerText = document.getElementById('winnerText');
    const finalScoreText = document.getElementById('finalScoreText');
    const restartButton = document.getElementById('restartButton');
    const countdown = document.getElementById('countdown');
    const countdownText = document.getElementById('countdownText');
    const chatMessages = document.getElementById('chat-messages');

    // User Stats UI
    const statLevel = document.getElementById('stat-level');
    const statXp = document.getElementById('stat-xp');
    const statXpNext = document.getElementById('stat-xp-next');
    const experienceBarFill = document.getElementById('experience-bar-fill');
    const statWins = document.getElementById('stat-wins');
    const statMatches = document.getElementById('stat-matches');
    const statGoals = document.getElementById('stat-goals');
    const statAssists = document.getElementById('stat-assists');
    const statWinrate = document.getElementById('stat-winrate');

    // Lobby UI Elements
    const lobbyContainer = document.getElementById('lobby-container');

    const createRoomBtn = document.getElementById('createRoomBtn');
    createRoomBtn.addEventListener('click', () => {
        const privateRoomCheckbox = document.getElementById('privateRoomCheckbox');
        const roomDurationSelect = document.getElementById('roomDurationSelect');
        const roomModeSelect = document.getElementById('roomModeSelect');
        const ballTextureSelect = document.getElementById('ballTextureSelect');
        const selectedOption = ballTextureSelect.options[ballTextureSelect.selectedIndex];
        const ballTexture = selectedOption.getAttribute('data-texture');

        socket.emit('createRoom', {
            isPrivate: privateRoomCheckbox.checked,
            duration: roomDurationSelect.value,
            mode: roomModeSelect.value,
            ballTexture: ballTexture
        });
    });
    const roomsDiv = document.getElementById('rooms');
    const roomDurationSelect = document.getElementById('roomDurationSelect');
    const roomModeSelect = document.getElementById('roomModeSelect');
    const privateRoomCheckbox = document.getElementById('privateRoomCheckbox');
    const joinRoomIdInput = document.getElementById('joinRoomIdInput');
    const joinByIdBtn = document.getElementById('joinByIdBtn');
    const onlineUsersDiv = document.getElementById('users');

    // Current Room UI
    const currentRoomContainer = document.getElementById('current-room-container');
    const currentRoomName = document.getElementById('currentRoomName');
    const roomId = document.getElementById('room-id');
    const roomPlayersDiv = document.getElementById('room-players');
    const readyBtn = document.getElementById('readyBtn');
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');

    // Global Ranking UI
    const globalRankingOverlay = document.getElementById('globalRanking');
    const closeRankingBtn = document.getElementById('closeRankingBtn');
    const rankByResultsBtn = document.getElementById('rank-by-results');
    const rankByPerformanceBtn = document.getElementById('rank-by-performance');
    const rankingListDiv = document.getElementById('ranking-list');

    // Game Constants
    const SNAKE_SIZE = 20;
    let GOAL_HEIGHT = 150;
    const MARGIN = 30;
    let FIELD_WIDTH = canvas.width - MARGIN * 2;
    let FIELD_HEIGHT = canvas.height - MARGIN * 2;

    // --- Ball Texture ---
    let ballTexture = new Image();
    let ballPattern = null;

    // Function to update the ball texture
    function updateBallTexture(texturePath) {
        ballTexture = new Image();
        ballTexture.onload = function () {
            // Create a pattern from the loaded image
            ballPattern = ctx.createPattern(ballTexture, 'repeat');
        };
        ballTexture.src = texturePath;
    }

    updateBallTexture('assets/ball-base-1.png');

    // Local State
    // Interpolation constants and state buffer
    const INTERPOLATION_DELAY = 80; // ms
    let stateBuffer = [];
    let localState = {}; // Still used for UI and non-interpolated data
    let gameStarted = false;
    window.localPlayerTeam = null; // Make team globally accessible for chat.js
    window.localPlayerTeam = null; // Make team globally accessible for chat.js

    // --- Interpolation function ---
    function lerp(start, end, t) {
        return start + (end - start) * t;
    }

    function adjustGameSetup(mode) {
        switch (mode) {
            case '2vs2':
                canvas.width = 1060;
                canvas.height = 760;
                GOAL_HEIGHT = 180;
                break;
            case '3vs3':
                canvas.width = 1260;
                canvas.height = 860;
                GOAL_HEIGHT = 210;
                break;
            case '1vs1':
            default:
                canvas.width = 860;
                canvas.height = 660;
                GOAL_HEIGHT = 150;
                break;
        }
        FIELD_WIDTH = canvas.width - MARGIN * 2;
        FIELD_HEIGHT = canvas.height - MARGIN * 2;
        // Ensure canvas wrapper resizes to center the canvas if needed by CSS
        const canvasWrapper = document.getElementById('canvas-wrapper');
        canvasWrapper.style.width = `${canvas.width}px`;
        canvasWrapper.style.height = `${canvas.height}px`;
        scoreBoard.style.width = `${canvas.width}px`;
    }

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
        ctx.fillStyle = 'rgba(255, 65, 54, 0.33)';
        ctx.fillRect(0, goalY, MARGIN, GOAL_HEIGHT);
        ctx.strokeStyle = '#FF4136';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, goalY, MARGIN, GOAL_HEIGHT);
        ctx.fillStyle = 'rgba(0, 116, 217, 0.33)';
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

            // Dibuja el nametag sobre la cabeza de la serpiente
            if (player.body.length > 0) {
                const head = player.body[0];
                ctx.fillStyle = 'white';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                // Ajustar la posición 'y' para que esté sobre la serpiente
                ctx.fillText(player.username, head.x + SNAKE_SIZE / 2, head.y - 8);
            }
        }
    }

    function drawBall(ball) {
        if (ball && ball.x) {
            if (ballPattern && ballTexture.width > 0 && ballTexture.height > 0) {
                // To simulate rolling, the texture is translated in the opposite direction
                // of the ball's position, relative to the canvas origin.
                const matrix = new DOMMatrix().translate(ball.x * 1.6, ball.y * 1.6); // Multiplier must be > 1
                ballPattern.setTransform(matrix);

                ctx.fillStyle = ballPattern;
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Fallback to a solid color if the pattern hasn't loaded yet
                ctx.fillStyle = '#F0F0F0';
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
                ctx.fill();
            }
            // Agregar efecto de iluminación esférica
            const gradient = ctx.createRadialGradient(
                ball.x - ball.size * 0.3, // Punto de luz desplazado a la izquierda
                ball.y - ball.size * 0.3, // y hacia arriba
                ball.size * 0.1,
                ball.x,
                ball.y,
                ball.size
            );
            gradient.addColorStop(0, 'rgba(255,255,255,0.3)'); // Brillo
            gradient.addColorStop(1, 'rgba(0,0,0,0.4)');       // Sombra
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    // --- Main Drawing Loop ---
    function loop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const renderTimestamp = Date.now() - INTERPOLATION_DELAY;
        // Find the two states to interpolate between
        let targetState = null;
        let nextState = null;
        for (let i = stateBuffer.length - 1; i >= 0; i--) {
            if (stateBuffer[i].timestamp <= renderTimestamp) {
                targetState = stateBuffer[i];
                nextState = stateBuffer[i + 1];
                break;
            }
        }
        drawField();

        if (gameStarted && targetState && nextState) {
            const t = (renderTimestamp - targetState.timestamp) / (nextState.timestamp - targetState.timestamp);

            // Interpolate ball
            const interpolatedBall = { ...targetState.data.ball };
            if (targetState.data.ball && nextState.data.ball) {
                interpolatedBall.x = lerp(targetState.data.ball.x, nextState.data.ball.x, t);
                interpolatedBall.y = lerp(targetState.data.ball.y, nextState.data.ball.y, t);
            }
            drawBall(interpolatedBall);

            // Interpolate players
            const interpolatedPlayers = {};
            for (const id in targetState.data.players) {
                const p1 = targetState.data.players[id];
                const p2 = nextState.data.players[id];

                if (p1 && p2) {
                    interpolatedPlayers[id] = { ...p1, body: [] };
                    for (let i = 0; i < p1.body.length; i++) {
                        if (p2.body[i]) {
                            const newSeg = {
                                x: lerp(p1.body[i].x, p2.body[i].x, t),
                                y: lerp(p1.body[i].y, p2.body[i].y, t)
                            };
                            interpolatedPlayers[id].body.push(newSeg);
                        }
                    }
                }
            }
            drawPlayers(interpolatedPlayers);
        } else if (gameStarted && localState.players) {
            // Fallback to last known state if not enough data to interpolate
            drawBall(localState.ball);
            drawPlayers(localState.players);
        }
        drawGoals();

        requestAnimationFrame(loop);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // --- UI Update Functions ---
    function updateUI(state) {
        scoreDiv.textContent = ` ${state.score.team1} - ${state.score.team2} `;
        timerDiv.textContent = `${formatTime(state.timeLeft)}`;

        if (state.goalScoredBy) {
            const teamColor = state.goalScoredBy === 'team1' ? 'Rojo' : 'Azul';
            goalMessage.textContent = `¡Gol del equipo ${teamColor}!`;
            goalMessage.classList.remove('hidden');
        } else {
            goalMessage.classList.add('hidden');
        }
    }

    function updateRoomList(rooms) {
        roomsDiv.innerHTML = rooms.map(room => {
            const isFull = room.playerCount >= room.maxPlayers;
            return `
                <div class="room-item">
                    <span>${room.id} ${room.duration / 60}m (${room.playerCount}/${room.maxPlayers})</span>
                    <button data-room-id="${room.id}" data-action="join" ${isFull ? 'disabled' : ''}>${isFull ? 'Sala llena' : 'Unirse'}</button>
                </div>
            `;
        }).join('');
        /* Si no hay salas, mostrar mensaje */
        if (rooms.length === 0) {
            roomsDiv.innerHTML = '<p>No hay salas disponibles</p>';
        }
    }

    function showLobbyView() {
        if (chatMessages) {
            chatMessages.innerHTML = ''; // Clear chat when returning to lobby
        }
        window.isInRoom = false;
        lobbyContainer.querySelector('#room-actions').classList.remove('hidden');
        lobbyContainer.querySelector('#room-id-join').classList.remove('hidden');
        lobbyContainer.querySelector('#room-list').classList.remove('hidden');
        currentRoomContainer.classList.add('hidden');
        scoreDiv.textContent = '0 - 0';
        timerDiv.textContent = '00:00';
    }

    function showCurrentRoomView(room) {
        window.isInRoom = true;
        lobbyContainer.querySelector('#room-actions').classList.add('hidden');
        lobbyContainer.querySelector('#room-id-join').classList.add('hidden');
        lobbyContainer.querySelector('#room-list').classList.add('hidden');
        currentRoomContainer.classList.remove('hidden');
        currentRoomName.innerHTML = `${room.name}`;
        roomId.textContent = `ID: ${room.id}`;
        updateRoomPlayers(room.players);
    }

    function updateRoomPlayers(players) {
        roomPlayersDiv.innerHTML = Object.values(players).map(p => {
            const teamClass = p.team === 'team1' ? 'team-red' : 'team-blue';
            return `<div class="player-item ${p.id === socket.id ? 'current-user' : ''} ${teamClass}">
                ${p.isReady ? '✅' : '⬛'} ${p.username}
            </div>`;
        }).join('');

        const allReady = Object.values(players).every(p => p.isReady);
        const currentPlayer = players[socket.id];
        const playerIsReady = currentPlayer?.isReady;
        readyBtn.textContent = playerIsReady ? 'No estoy listo' : '¡Listo!';
        readyBtn.disabled = allReady;
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
            alert('Ingrese un nombre de usuario.');
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
        switch (e.key.toLowerCase()) {
            case 'arrowup':
            case 'w':
                direction = 'up';
                break;
            case 'arrowdown':
            case 's':
                direction = 'down';
                break;
            case 'arrowleft':
            case 'a':
                direction = 'left';
                break;
            case 'arrowright':
            case 'd':
                direction = 'right';
                break;
        }
        if (direction) socket.emit('directionChange', { direction });
    });

    createRoomBtn.addEventListener('click', () => {
        const duration = parseInt(roomDurationSelect.value, 10);
        const mode = roomModeSelect.value;
        const isPrivate = privateRoomCheckbox.checked;
        const ballTextureSelect = document.getElementById('ballTextureSelect');
        const selectedOption = ballTextureSelect.options[ballTextureSelect.selectedIndex];
        const ballTexture = selectedOption.getAttribute('data-texture');

        socket.emit('createRoom', {
            duration,
            mode,
            isPrivate,
            ballTexture
        });
    });

    joinByIdBtn.addEventListener('click', () => {
        const roomId = joinRoomIdInput.value.trim();
        if (roomId) {
            socket.emit('joinRoomById', { roomId });
            joinRoomIdInput.value = '';
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

    // --- Global Ranking Listeners ---
    rankingBtn.addEventListener('click', () => {
        globalRankingOverlay.classList.remove('hidden');
        // Request ranking by default filter (e.g., results)
        socket.emit('getGlobalRanking', { sortBy: 'results' });
        rankByResultsBtn.classList.add('active');
        rankByPerformanceBtn.classList.remove('active');
    });

    closeRankingBtn.addEventListener('click', () => {
        globalRankingOverlay.classList.add('hidden');
    });

    rankByResultsBtn.addEventListener('click', () => {
        socket.emit('getGlobalRanking', { sortBy: 'results' });
        rankByResultsBtn.classList.add('active');
        rankByPerformanceBtn.classList.remove('active');
    });

    rankByPerformanceBtn.addEventListener('click', () => {
        socket.emit('getGlobalRanking', { sortBy: 'performance' });
        rankByPerformanceBtn.classList.add('active');
        rankByResultsBtn.classList.remove('active');
    });

    // --- Socket.IO Handlers ---

// --- Socket.IO Handlers ---
socket.on('joinedRoom', (room) => {
// Update ball texture on joining a room
if (room.ballTexture) {
updateBallTexture(room.ballTexture);
}

// Set local player team for chat coloring
const localPlayer = Object.values(room.players).find(p => p.id === socket.id);
if (localPlayer) {
window.localPlayerTeam = localPlayer.team;
}
    });

    socket.on('roomList', (rooms) => {
        updateRoomList(rooms);
    });

    socket.on('globalRankingUpdate', (ranking) => {
        updateRankingTable(ranking);
    });

    socket.on('initialState', (initialState) => {
        localState = initialState;
        updateUI(initialState);
    });

    socket.on('playerStats', (stats) => {
        updatePlayerStatsUI(stats);
    });

    socket.on('joinedRoom', (room) => {
        showCurrentRoomView(room);
    });

    socket.on('roomUpdate', (room) => {
        // Update ball texture only if it has changed
        if (room.ballTexture) {
            updateBallTexture(room.ballTexture);
        }
        updateRoomPlayers(room.players);
    });

    socket.on('onlineUsers', (onlineUsernames) => {
        onlineUsersDiv.innerHTML = onlineUsernames.map(username => `<div><span>></span> ${username}</div>`).join('');
    });

    socket.on('kickoffCountdown', (data) => {
        if (data.count === '') {
            countdown.classList.add('hidden');
        } else {
            countdown.classList.remove('hidden');
            countdownText.textContent = data.count;
        }
    });

    socket.on('gameCountdown', (data) => {
        // data is now an object { count, mode }
        if (data.count === 3) { // Resize canvas on the first countdown tick
            adjustGameSetup(data.mode);
        }

        if (data.cancelled) {
            countdown.classList.add('hidden');
            showLobbyView(); // Vuelve a mostrar el lobby/sala si la cuenta atrás se cancela
        } else if (data.count === '') {
            countdown.classList.add('hidden'); // Oculta el contador cuando termina normalmente
        } else {
            currentRoomContainer.classList.add('hidden');
            countdown.classList.remove('hidden');
            countdownText.textContent = data.count;
        }
    });

    socket.on('gameStart', (initialState) => {
        adjustGameSetup(initialState.mode);
        gameStarted = true;
        localState = initialState;
        currentRoomContainer.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        updateUI(initialState);
    });

    // Nueva función para manejar la actualización del estado del juego
    function handleGameState(gameState) {
        if (!gameState || !gameState.players) return;

        // Encuentra al jugador actual usando el socket.id
        const currentPlayer = gameState.players[socket.id];

        // Si el jugador existe y tiene estadísticas, actualiza la UI
        if (currentPlayer && currentPlayer.stats) {
            updatePlayerStatsUI(currentPlayer.stats);
        }

        // Aquí iría el resto de la lógica para renderizar el juego (jugadores, pelota, etc.)
        // Por ejemplo: renderGame(gameState);
    }

    socket.on('gameState', (gameState) => {
        const now = Date.now();
        stateBuffer.push({ timestamp: now, data: gameState });

        // Clean up old states from buffer to prevent memory leaks
        const bufferThreshold = now - 2000; // Keep 2 seconds of states
        stateBuffer = stateBuffer.filter(state => state.timestamp > bufferThreshold);

        handleGameState(gameState);
        if (gameStarted) {
            localState = gameState; // Keep for UI updates
            updateUI(gameState);
        }
    });

    socket.on('gameOver', (data) => {
        gameStarted = false;
        localState.isGameOver = true;
        let message = 'Game Over!';
        if (data.winner === 'draw') {
            message = "¡Empate!";
        } else if (data.winner) {
            const winnerColor = data.winner === 'team1' ? 'Rojo' : 'Azul';
            message = `¡Gana el equipo ${winnerColor}!`;
        }
        winnerText.textContent = message;
        finalScoreText.textContent = `Resultado: ${data.score.team1} - ${data.score.team2}`;

        updateMatchStatsTable(data.playerMatchStats);

        gameOverScreen.classList.remove('hidden');
        goalMessage.classList.add('hidden');
        // Reset canvas to default size
        adjustGameSetup('1vs1');
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

    function updateRankingTable(ranking) {
        let tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th></th>
                        <th>Jugador</th>
                        <th>Nivel</th>
                        <th title="Victorias">V</th>
                        <th title="Derrotas">D</th>
                        <th title="Empates">E</th>
                        <th>Goles</th>
                        <th>Asist.</th>
                        <th>Winrate</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (ranking.length === 0) {
            tableHTML += '<tr><td colspan="9">No hay datos de ranking todavía. ¡Juega una partida!</td></tr>';
        } else {
            ranking.forEach((player, index) => {
                const winrate = player.total_matches > 0 ? ((player.wins / player.total_matches) * 100).toFixed(1) + '%' : 'N/A';
                tableHTML += `
                    <tr>
                        <td>#${index + 1}</td>
                        <td>${player.username}</td>
                        <td>Lv ${player.level}</td>
                        <td style="color:#00ff99">${player.wins}</td>
                        <td style="color:#ff6b6b">${player.losses}</td>
                        <td style="color:#f0f0f0">${player.draws}</td>
                        <td>⚽${player.total_goals}</td>
                        <td>🎯${player.total_assists}</td>
                        <td>${winrate}</td>
                    </tr>
                `;
            });
        }

        tableHTML += '</tbody></table>';
        rankingListDiv.innerHTML = tableHTML;
    }

    function updateMatchStatsTable(stats) {
        const tableBody = document.querySelector('#match-stats-table tbody');
        if (!tableBody || !stats) return;

        tableBody.innerHTML = ''; // Clear previous stats

        for (const playerId in stats) {
            const stat = stats[playerId];
            const score = (stat.goals * 100) + (stat.assists * 50) + (stat.touches * 1); // Calcular puntuación
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${stat.username}</td>
                <td>${score}</td>
                <td>${stat.goals}</td>
                <td>${stat.assists}</td>
                <td>${stat.touches}</td>
            `;
            tableBody.appendChild(row);
        }
    }

    function updatePlayerStatsUI(stats) {
        if (!stats) return;

        statLevel.textContent = stats.level;
        statXp.textContent = stats.experience;
        statXpNext.textContent = stats.xpToNextLevel;
        statWins.textContent = stats.wins;
        statMatches.textContent = stats.total_matches;
        statGoals.textContent = stats.total_goals;
        statAssists.textContent = stats.total_assists;

        const winrate = stats.total_matches > 0 ? (((stats.wins + stats.draws * 0.5) / stats.total_matches) * 100).toFixed(1) : 0;
        statWinrate.textContent = `${winrate}%`;

        const xpPercentage = stats.xpToNextLevel > 0 ? (stats.experience / stats.xpToNextLevel) * 100 : 0;
        experienceBarFill.style.width = `${xpPercentage}%`;
    }

    function closeAllSelect(elmnt) {
        const items = document.getElementsByClassName('select-items');
        const selected = document.getElementsByClassName('select-selected');

        for (let i = 0; i < selected.length; i++) {
            if (elmnt === selected[i]) {
                continue;
            }
            if (items[i].classList.contains('select-hide')) {
                continue;
            }
            items[i].classList.add('select-hide');
            selected[i].classList.remove('select-arrow-active');
        }
    }

    function initCustomSelects() {
        const customSelects = document.getElementsByClassName('custom-select');

        for (let i = 0; i < customSelects.length; i++) {
            const select = customSelects[i].getElementsByTagName('select')[0];
            const selected = customSelects[i].getElementsByClassName('select-selected')[0];
            const selectItems = customSelects[i].getElementsByClassName('select-items')[0];

            // Skip if already initialized
            if (select.getAttribute('data-initialized') === 'true') continue;

            // Mark as initialized
            select.setAttribute('data-initialized', 'true');

            // Hide the original select element
            select.style.display = "none";

            // Clear any existing options in the custom dropdown
            selectItems.innerHTML = '';

            // Click handler for the selected item
            selected.addEventListener('click', function (e) {
                e.stopPropagation();
                closeAllSelect(this);
                this.nextElementSibling.classList.toggle('select-hide');
                this.classList.toggle('select-arrow-active');
            });

            // Create options for the custom select
            const options = select.options;
            for (let j = 0; j < options.length; j++) {
                const option = options[j];
                const optionElement = document.createElement('div');
                optionElement.className = 'select-option';
                optionElement.setAttribute('data-value', option.value);

                // Create ball preview for the option
                const ballPreview = document.createElement('div');
                ballPreview.className = 'ball-preview';
                ballPreview.style.backgroundImage = `url('${option.getAttribute('data-texture')}')`;

                optionElement.appendChild(ballPreview);

                // Click handler for each option
                optionElement.addEventListener('click', function () {
                    // Update the selected value
                    select.selectedIndex = j;
                    selected.innerHTML = '';

                    // Update the selected display
                    const selectedBallPreview = document.createElement('div');
                    selectedBallPreview.className = 'ball-preview';
                    selectedBallPreview.style.backgroundImage = `url('${option.getAttribute('data-texture')}')`;
                    selected.appendChild(selectedBallPreview);

                    // Update the ball texture
                    updateBallTexture(option.getAttribute('data-texture'));

                    // Close the dropdown
                    closeAllSelect();
                });

                selectItems.appendChild(optionElement);
            }
        }
    }

    document.addEventListener('click', closeAllSelect);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCustomSelects);
    } else {
        // DOMContentLoaded has already fired
        initCustomSelects();
    }

    // Start drawing loop
    loop();
});
