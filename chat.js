document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');

    const quickChatMessages = {
        1: { // Informacion
            name: 'Informacion',
            messages: {
                1: 'Lo tengo!',
                2: 'Cooldown',
                3: 'Es tuya!',
                4: 'Defiendo...'
            }
        },
        2: { // Cumplidos
            name: 'Cumplidos',
            messages: {
                1: 'Buen disparo!',
                2: 'Buen pase!',
                3: 'Gracias!',
                4: 'Buena salvada!'
            }
        },
        3: { // Reacciones
            name: 'Reacciones',
            messages: {
                1: 'OMG!',
                2: 'Nooo!',
                3: 'Wow!',
                4: 'Estuvo cerca!'
            }
        },
        4: { // Disculpas
            name: 'Disculpas',
            messages: {
                1: '$#@%!',
                2: 'No hay problema',
                3: 'Ups...',
                4: 'Lo siento!'
            }
        }
    };

    let currentCategory = null;
    let chatTarget = 'all'; // 'all' or 'team'
    const messageTimestamps = [];
    const SPAM_MESSAGE_LIMIT = 3;
    const SPAM_TIME_WINDOW_MS = 5000; // 5 seconds
    let chatTimeout;

    function showMessage(message, target) {
        // Spam prevention
        const now = Date.now();
        while (messageTimestamps.length > 0 && now - messageTimestamps[0] > SPAM_TIME_WINDOW_MS) {
            messageTimestamps.shift();
        }

        if (messageTimestamps.length >= SPAM_MESSAGE_LIMIT) {
            console.log('Chat spam detected. Please wait.');
            // Optionally, show a message to the user about spamming
            return;
        }

        messageTimestamps.push(now);

        // Make chat visible
        chatContainer.classList.add('active');

        // Create and add new message
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');
        
        const targetPrefix = target === 'team' ? '[EQUIPO] ' : '[TODOS] ';
        const targetClass = target === 'team' ? 'team-message' : 'all-message';

        messageElement.innerHTML = `<span class="${targetClass}">${targetPrefix}</span>${message}`;
        chatContainer.appendChild(messageElement);

        // Limit to 8 messages
        if (chatContainer.children.length > 8) {
            chatContainer.removeChild(chatContainer.firstChild);
        }

        // Hide chat after a delay
        clearTimeout(chatTimeout);
        chatTimeout = setTimeout(() => {
            chatContainer.classList.remove('active');
        }, 4000); // Hide after 4 seconds
    }

    document.addEventListener('keydown', (e) => {
        const key = e.key.toUpperCase();

        if (key === 'T') {
            chatTarget = 'all';
            console.log('Chat target: ALL');
            // You might want to show a temporary indicator for the selected target
            return; 
        }

        if (key === 'Y') {
            chatTarget = 'team';
            console.log('Chat target: TEAM');
            return;
        }

        const numericKey = parseInt(e.key, 10);
        if (!isNaN(numericKey) && numericKey >= 1 && numericKey <= 4) {
            if (currentCategory === null) {
                // Select category
                currentCategory = numericKey;
                console.log(`Category selected: ${quickChatMessages[currentCategory].name}`);
                // Maybe show category options on screen
            } else {
                // Select message from category
                const message = quickChatMessages[currentCategory].messages[numericKey];
                if (message) {
                    showMessage(message, chatTarget);
                }
                // Reset after sending
                currentCategory = null;
                chatTarget = 'all'; // Reset to default
            }
        }
    });
});
