/**
 * Terminal-Style Notification System
 * Replaces browser alert() with cyberpunk-themed notifications
 */

class TerminalNotification {
    constructor() {
        this.overlay = null;
        this.init();
    }

    init() {
        // Create overlay container if it doesn't exist
        if (!document.getElementById('terminal-notification-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'terminal-notification-overlay';
            overlay.className = 'terminal-notification-overlay';
            document.body.appendChild(overlay);
            this.overlay = overlay;

            // Click outside to close
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.hide();
                }
            });
        } else {
            this.overlay = document.getElementById('terminal-notification-overlay');
        }
    }

    /**
     * Show a notification
     * @param {string} message - The message to display
     * @param {string} type - Type: 'success', 'error', 'warning', 'info'
     * @param {function} callback - Optional callback when closed
     */
    show(message, type = 'info', callback = null) {
        this.init(); // Ensure overlay exists

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `terminal-notification ${type}`;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'terminal-notification-message';
        messageDiv.textContent = message;

        const button = document.createElement('button');
        button.className = 'terminal-notification-button';
        button.textContent = 'OK';
        button.addEventListener('click', () => {
            this.hide();
            if (callback) callback();
        });

        notification.appendChild(messageDiv);
        notification.appendChild(button);

        // Clear previous notifications
        this.overlay.innerHTML = '';
        this.overlay.appendChild(notification);

        // Show with animation
        setTimeout(() => {
            this.overlay.classList.add('active');
        }, 10);

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.hide();
                if (callback) callback();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // Auto-focus button for accessibility
        setTimeout(() => button.focus(), 300);
    }

    hide() {
        if (this.overlay) {
            this.overlay.classList.remove('active');
            // Clean up after animation
            setTimeout(() => {
                this.overlay.innerHTML = '';
            }, 300);
        }
    }

    // Convenience methods
    success(message, callback) {
        this.show(message, 'success', callback);
    }

    error(message, callback) {
        this.show(message, 'error', callback);
    }

    warning(message, callback) {
        this.show(message, 'warning', callback);
    }

    info(message, callback) {
        this.show(message, 'info', callback);
    }
}

// Create global instance
const terminalNotify = new TerminalNotification();

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TerminalNotification;
}
