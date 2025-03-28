// ===== FILE: main.js =====
import * as state from './state.js';
// Import initializers from each component module
import { initializeSidebar } from './components/sidebar.js';
import { initializeChatInput } from './components/chatInput.js';
import { initializeMessageList, showWelcomeInterface } from './components/messageList.js';
import { initializeSettingsModal } from './components/settingsModal.js';
import { initializeWelcomeScreen } from './components/welcomeScreen.js';
import { initializeHeader } from './components/header.js';
// <<< NEW: Import initializer for Custom GPT Creator Screen >>>
import { initializeCreatorScreen } from './customGpt/creatorScreen.js';

/**
 * Main application entry point.
 * Initializes state, components, and sets the initial UI view.
 */
function initializeApp() {
    console.log("Initializing App...");

    // Load general settings first
    state.loadSettings();
    // Load the initially active Custom GPT config (if any) from storage potentially
    // This might be better handled after component initialization
    // gptStore.loadInitialActiveConfig(); // Example hypothetical function

    // Initialize Core Components
    initializeSidebar();
    initializeChatInput();
    initializeMessageList();
    initializeSettingsModal(); // Initializes the modal shell and general settings part
    initializeWelcomeScreen();
    initializeHeader(); // Initializes header dropdowns and active GPT display

    // <<< NEW: Initialize the Custom GPT Creator Screen Modal >>>
    initializeCreatorScreen(); // Initializes the separate modal for creating/editing GPTs

    // Set initial view (could depend on whether a custom GPT is active)
    const activeGpt = state.getActiveCustomGptConfig();
    if (activeGpt) {
        // If starting with an active GPT, maybe show chat interface directly?
        // For now, let's stick to welcome, user can start chatting.
        // showChatInterface(); // Or just update header display which initializeHeader does
    }
    showWelcomeInterface(); // Default to welcome screen

    console.log("App Initialized.");
}

// Wait for the DOM to be fully loaded before running the initialization logic
document.addEventListener('DOMContentLoaded', initializeApp);