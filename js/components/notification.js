// ===== FILE: js/components/notification.js =====

// Import necessary functions
import { escapeHTML } from '../utils.js';

// --- DOM Elements ---
const notificationContainer = document.getElementById('notificationContainer');

// Define autoRemoveTimeoutId at the module level
let autoRemoveTimeoutId;

/**
 * Displays a temporary notification message on the screen.
 * @param {string} message - The message content to display.
 * @param {'info' | 'success' | 'error' | 'warning'} type - The type of notification (controls styling). Defaults to 'info'.
 * @param {number} duration - How long the notification stays visible in milliseconds. Defaults to 3000.
 */
export function showNotification(message, type = 'info', duration = 3000) {
    if (!notificationContainer) {
        console.error("Notification container not found!");
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Make notification element clickable
    notification.style.pointerEvents = 'auto';

    notification.innerHTML = `
        <div class="notification-content">${escapeHTML(message)}</div>
        <button class="notification-close">&times;</button>
    `;

    // --- Close Button Logic ---
    const closeButton = notification.querySelector('.notification-close');
    
    // Reset any existing timeout
    if (autoRemoveTimeoutId) {
        clearTimeout(autoRemoveTimeoutId);
    }

    const removeNotification = () => {
        // Fade out animation 
        notification.style.opacity = '0';
        // Use setTimeout to remove after fade-out transition completes
        setTimeout(() => {
            if (notificationContainer.contains(notification)) {
                notificationContainer.removeChild(notification);
            }
        }, 300); // Match CSS transition duration
        clearTimeout(autoRemoveTimeoutId);
    };

    closeButton?.addEventListener('click', removeNotification);

    // Append to container
    notificationContainer.appendChild(notification);
    
    // Set initial opacity to 0 and then transition to 1 for smooth appearance
    notification.style.opacity = '0';
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);

    // --- Auto-remove Logic ---
    autoRemoveTimeoutId = setTimeout(removeNotification, duration);

    // Pause auto-remove on hover
    notification.addEventListener('mouseenter', () => clearTimeout(autoRemoveTimeoutId));
    notification.addEventListener('mouseleave', () => {
        autoRemoveTimeoutId = setTimeout(removeNotification, duration / 2);
    });
}

// --- Initialization ---
// No specific initialization needed for this component usually,
// as it just exports a function to be called by others.
// export function initializeNotifications() { }

// --- Exports ---
// Export the main function. Already done via 'export function showNotification...'