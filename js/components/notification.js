// ===== FILE: js/components/notification.js =====

// Import necessary functions if they remain in utils or are moved elsewhere
import { escapeHTML } from '../utils.js'; // Assuming escapeHTML stays in utils.js

// --- DOM Elements ---
const notificationContainer = document.getElementById('notificationContainer');

// --- Notification Logic ---

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
    // Add base class and type-specific class (e.g., 'notification info')
    notification.className = `notification ${type}`;

    // Use innerHTML to structure the notification content and close button
    notification.innerHTML = `
        <div class="notification-content">${escapeHTML(message)}</div>
        <button class="notification-close">&times;</button>
    `;

    // --- Close Button Logic ---
    const closeButton = notification.querySelector('.notification-close');
    let autoRemoveTimeoutId; // Keep track of the timeout

    const removeNotification = () => {
        // Fade out animation (optional, depends on CSS)
        notification.style.opacity = '0';
        // Use setTimeout to remove after fade-out transition completes (e.g., 300ms)
        setTimeout(() => {
            if (notificationContainer.contains(notification)) {
                notificationContainer.removeChild(notification);
            }
        }, 300); // Match CSS transition duration
        clearTimeout(autoRemoveTimeoutId); // Clear auto-remove timeout if closed manually
    };

    closeButton?.addEventListener('click', removeNotification);

    // Append to container
    notificationContainer.appendChild(notification);

    // --- Auto-remove Logic ---
    autoRemoveTimeoutId = setTimeout(removeNotification, duration);

    // Optional: Pause auto-remove on hover (add mouseenter/mouseleave listeners)
    // notification.addEventListener('mouseenter', () => clearTimeout(autoRemoveTimeoutId));
    // notification.addEventListener('mouseleave', () => {
    //    autoRemoveTimeoutId = setTimeout(removeNotification, duration / 2); // Optionally shorter duration after hover
    // });
}

// --- Initialization ---
// No specific initialization needed for this component usually,
// as it just exports a function to be called by others.
// export function initializeNotifications() { }

// --- Exports ---
// Export the main function. Already done via 'export function showNotification...'