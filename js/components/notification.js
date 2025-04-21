// ===== FILE: js/components/notification.js =====

// Import necessary functions
import { escapeHTML } from '../utils.js';

// --- DOM Elements ---
const notificationContainer = document.getElementById('notificationContainer');

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

    // Check for duplicate notifications that are still visible
    const existingNotifications = Array.from(notificationContainer.children);
    const duplicateNotification = existingNotifications.find(notification => {
        const content = notification.querySelector('.notification-content');
        return content && content.textContent === message;
    });

    // If a duplicate notification exists, don't create a new one
    if (duplicateNotification) {
        // Reset its timeout
        const timeoutId = duplicateNotification.dataset.timeoutId;
        if (timeoutId) {
            clearTimeout(parseInt(timeoutId));
        }
        // Set new timeout
        const newTimeoutId = setTimeout(() => removeNotification(duplicateNotification), duration);
        duplicateNotification.dataset.timeoutId = newTimeoutId;
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.pointerEvents = 'auto';

    notification.innerHTML = `
        <div class="notification-content">${escapeHTML(message)}</div>
        <button class="notification-close">&times;</button>
    `;

    // --- Close Button Logic ---
    const closeButton = notification.querySelector('.notification-close');
    
    const removeNotification = (notif) => {
        // Fade out animation 
        notif.style.opacity = '0';
        // Clear the timeout
        const timeoutId = notif.dataset.timeoutId;
        if (timeoutId) {
            clearTimeout(parseInt(timeoutId));
        }
        // Use setTimeout to remove after fade-out transition completes
        setTimeout(() => {
            if (notificationContainer.contains(notif)) {
                notificationContainer.removeChild(notif);
            }
        }, 300); // Match CSS transition duration
    };

    closeButton?.addEventListener('click', () => removeNotification(notification));

    // Append to container
    notificationContainer.appendChild(notification);
    
    // Set initial opacity to 0 and then transition to 1 for smooth appearance
    notification.style.opacity = '0';
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);

    // --- Auto-remove Logic ---
    const timeoutId = setTimeout(() => removeNotification(notification), duration);
    notification.dataset.timeoutId = timeoutId;

    // Pause auto-remove on hover
    notification.addEventListener('mouseenter', () => {
        const currentTimeoutId = notification.dataset.timeoutId;
        if (currentTimeoutId) {
            clearTimeout(parseInt(currentTimeoutId));
        }
    });
    
    notification.addEventListener('mouseleave', () => {
        const newTimeoutId = setTimeout(() => removeNotification(notification), duration / 2);
        notification.dataset.timeoutId = newTimeoutId;
    });
}

// --- Initialization ---
// No specific initialization needed for this component usually,
// as it just exports a function to be called by others.
// export function initializeNotifications() { }

// --- Exports ---
// Export the main function. Already done via 'export function showNotification...'