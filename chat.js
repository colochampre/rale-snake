document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatIndicator = document.getElementById('chat-indicator');
    const spamWarning = document.getElementById('spam-warning');

    const quickChat = {
        'Informacion': {
            messages: ['Lo tengo!', 'Cooldown', 'Es tuya!', 'Defiendo...']
        },
        'Cumplidos': {
            messages: ['Buen disparo!', 'Buen pase!', 'Gracias!', 'Buena salvada!']
        },
        'Reacciones': {
            messages: ['OMG!', 'Nooo!', 'Wow!', 'Estuvo cerca!']
        },
        'Disculpas': {
            messages: ['$#@%!', 'No hay problema', 'Ups...', 'Lo siento!']
        }
    };

    const SPAM_MESSAGE_LIMIT = 3;
    const SPAM_TIME_FRAME = 5000;
    const messageTimestamps = [];

    let chatTimeout = null;
    let indicatorTimeout = null, systemMessageTimeout;
    let currentCategory = null;
    let chatTarget = 'all';

    if (window.socket) {
        window.socket.on('chatMessage', ({ username, message }) => {
            displayMessage(username, message);
        });
    }

    function displayMessage(username, message) {
        const now = Date.now();
        while (messageTimestamps.length > 0 && now - messageTimestamps[0] > SPAM_TIME_FRAME) {
            messageTimestamps.shift();
        }

        if (messageTimestamps.length >= SPAM_MESSAGE_LIMIT) {
            showSystemMessage('Spam detectado');
            return;
        }
        messageTimestamps.push(now);

        chatContainer.classList.add('active');
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');
        messageElement.innerHTML = `<span class="username">${username}:</span> ${message}`;
        chatMessages.appendChild(messageElement);

        if (chatMessages.children.length > 8) {
            chatMessages.removeChild(chatMessages.firstChild);
        }

        clearTimeout(chatTimeout);
        chatTimeout = setTimeout(() => {
            chatContainer.classList.remove('active');
        }, 4000);
    }

    function showSystemMessage(message, duration = 2000) {
        clearTimeout(systemMessageTimeout); // Clear any existing timeout

        spamWarning.textContent = message;
        spamWarning.classList.add('visible');

        systemMessageTimeout = setTimeout(() => {
            spamWarning.classList.remove('visible');
        }, duration);
    }

    function showIndicator(text, duration = 2000) {
        chatIndicator.innerHTML = text;
        chatIndicator.style.display = 'flex';
        chatIndicator.style.flexDirection = 'column';
        chatIndicator.style.gap = '8px';
        chatIndicator.style.position = 'absolute';
        chatIndicator.style.left = '0';
        clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => {
            chatIndicator.style.display = 'none';
            chatIndicator.innerHTML = '';
        }, duration);
    }

    document.addEventListener('keydown', (e) => {
        if (!window.isInRoom) return;

        const key = e.key.toUpperCase();

        if (key === 'T') {
            chatTarget = 'all';
            showIndicator('Destino: TODOS');
            return;
        }

        if (key === 'Y') {
            chatTarget = 'team';
            showIndicator('Destino: EQUIPO');
            return;
        }

        const numericKey = parseInt(e.key, 10);
        if (!isNaN(numericKey) && numericKey >= 1 && numericKey <= 4) {
            if (currentCategory === null) {
                const categoryName = Object.keys(quickChat)[numericKey - 1];
                const category = quickChat[categoryName];
                if (category) {
                    currentCategory = category;
                    const options = category.messages.map((msg, i) => `[${i + 1}] ${msg}`).join('<br>');
                    showIndicator(`<b>${categoryName}:</b>${options}`, 4000);
                }
            } else {
                const message = currentCategory.messages[numericKey - 1];
                if (message && window.socket) {
                    window.socket.emit('chatMessage', { message: message, target: chatTarget });
                }
                currentCategory = null;
                chatIndicator.style.display = 'none';
                clearTimeout(indicatorTimeout);
            }
        }
    });
});
