// ===== FILE: js/notificationHelper.js =====

// Import the new notification function
import { showNotification as newShowNotification } from './components/notification.js';

/**
 * A compatibility wrapper that redirects all notifications to the new system
 * This allows existing code to continue working without changes
 */
export function showNotification(message, type = 'info', duration = 3000) {
    // Simply forward all calls to the new implementation
    newShowNotification(message, type, duration);
}

/**
 * Initializes notification compatibility by exposing the showNotification
 * function globally for any code that might use it directly.
 */
export function initializeNotificationSystem() {
    // Add it to the window for any direct browser calls
    window.showNotification = showNotification;
    
    console.log("Notification system initialized");
} 