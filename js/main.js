// ===== FILE: main.js =====
import * as state from './state.js';
// Import initializers from each component module
import { initializeSidebar } from './components/sidebar.js';
import { initializeChatInput } from './components/chatInput.js';
import { initializeMessageList, showWelcomeInterface } from './components/messageList.js';
import { initializeSettingsModal } from './components/settingsModal.js';
import { initializeWelcomeScreen } from './components/welcomeScreen.js';
import { initializeHeader } from './components/header.js';
import { initializeCreatorScreen } from './customGpt/creatorScreen.js';
import { initializeNotificationSystem } from './notificationHelper.js';

/**
 * Main application entry point.
 * Initializes state, components, and sets the initial UI view.
 */
function initializeApp() {
    console.log("Initializing App...");
    
    // Initialize notification system first so it's available to other components
    initializeNotificationSystem();

    // Load general settings first
    state.loadSettings();

    // Initialize Core Components
    initializeSidebar();
    initializeChatInput();
    initializeMessageList();
    initializeSettingsModal();
    initializeWelcomeScreen();
    initializeHeader();
    initializeCreatorScreen();

    // Set initial view
    const activeGpt = state.getActiveCustomGptConfig();
    
    // Rest of your initialization code...
}

// Call init when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);