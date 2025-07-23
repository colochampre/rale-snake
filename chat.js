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

    let chatTimeout = null;
    let indicatorTimeout = null, systemMessageTimeout;
    let categoryTimeout = null;
    let currentCategory = null;
    let chatTarget = 'all';

    if (window.socket) {
        window.socket.on('chatMessage', ({ username, message, teamContext }) => {
            displayMessage(username, message, teamContext);
        });

        window.socket.on('spamWarning', (message) => {
            showSystemMessage(message, 5000);
        });
    }

    function displayMessage(username, message, teamContext) {
        let color;
        if (teamContext === 'all') {
            color = '#00ff99'; // Global message
        } else if (teamContext === 'red') {
            color = '#FF4136'; // Red team color
        } else if (teamContext === 'blue') {
            color = '#0074D9'; // Blue team color
        } else {
            color = '#FFFFFF'; // Default color if something goes wrong
        }

        chatContainer.classList.add('active');
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message');
        messageElement.innerHTML = `<span class="username" style="color: ${color};">${username}:</span> ${message}`;
        chatMessages.appendChild(messageElement);

        if (chatMessages.children.length > 8) {
            chatMessages.removeChild(chatMessages.firstChild);
        }

        clearTimeout(chatTimeout);
        chatTimeout = setTimeout(() => {
            chatContainer.classList.remove('active');
            chatTimeout = null; // Reset timeout after it fires
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

    function showIndicator(text, duration = 4000) {
        // Asegurar que el chat container esté visible para mostrar el indicador
        chatContainer.classList.add('active');

        // Si hay mensajes visibles pero no hay timeout activo, crear uno
        if (chatMessages.children.length > 0 && !chatTimeout) {
            chatTimeout = setTimeout(() => {
                chatContainer.classList.remove('active');
                chatTimeout = null;
            }, 4000);
        }

        chatIndicator.innerHTML = text;
        chatIndicator.classList.add('visible');
        clearTimeout(indicatorTimeout);
        indicatorTimeout = setTimeout(() => {
            chatIndicator.classList.remove('visible');
            chatIndicator.innerHTML = '';
            // Si no hay mensajes, ocultar el chat inmediatamente
            if (chatMessages.children.length === 0) {
                chatContainer.classList.remove('active');
            }
            // Si hay mensajes, el chatTimeout se encargará de ocultarlos
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
                    const options = category.messages.map((msg, i) => `${i + 1}.  ${msg}`).join('<br>');
                    showIndicator(`<b>${categoryName}:</b>${options}`, 6000);
                    
                    // Establecer timeout para resetear la categoría
                    clearTimeout(categoryTimeout);
                    categoryTimeout = setTimeout(() => {
                        currentCategory = null;
                        chatIndicator.classList.remove('visible');
                        clearTimeout(indicatorTimeout);
                        // Solo remover la clase active si no hay mensajes visibles
                        if (chatMessages.children.length === 0) {
                            chatContainer.classList.remove('active');
                        }
                    }, 4000);
                }
            } else {
                const message = currentCategory.messages[numericKey - 1];
                if (message && window.socket) {
                    window.socket.emit('chatMessage', { message: message, target: chatTarget });
                }
                // Resetear la categoría y limpiar timeouts
                currentCategory = null;
                chatIndicator.classList.remove('visible');
                clearTimeout(indicatorTimeout);
                clearTimeout(categoryTimeout);
                // Solo remover la clase active si no hay mensajes visibles
                if (chatMessages.children.length === 0) {
                    chatContainer.classList.remove('active');
                }
            }
        }
    });
});
