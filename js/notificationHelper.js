// ===== FILE: js/notificationHelper.js =====

// Import the new notification function
import { showNotification as baseShowNotification } from './components/notification.js';

// Flag to control notifications
let notificationsEnabled = false;

/**
 * Enable or disable notifications globally
 * @param {boolean} enabled - Whether notifications should be enabled
 */
export function setNotificationsEnabled(enabled) {
    notificationsEnabled = enabled;
}

/**
 * Compatibility wrapper for showing notifications.
 * @param {string} message - The message content to display.
 * @param {'info' | 'success' | 'error' | 'warning'} type - The type of notification (controls styling).
 * @param {number} duration - How long the notification stays visible in milliseconds.
 */
export function showNotificationCompat(message, type = 'info', duration = 3000) {
    if (notificationsEnabled) {
        baseShowNotification(message, type, duration);
    }
}

// Re-export the modern function both as default and named export
export const showNotification = (message, type = 'info', duration = 3000) => {
    if (notificationsEnabled) {
        baseShowNotification(message, type, duration);
    }
};
export default showNotification;

/**
 * Initializes notification system by exposing the showNotification
 * function globally for any code that might use it directly.
 */
export function initializeNotificationSystem() {
    // Add it to the window for any direct browser calls
    window.showNotification = showNotification;
    
    console.log("Notification system initialized");
}