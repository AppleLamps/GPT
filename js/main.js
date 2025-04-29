// ===== FILE: main.js =====
import * as state from './state.js';
// Import initializers from each component module
import { initializeSidebar } from './components/sidebar.js';
import { initializeImageGenPage } from './components/imageGenPage.js';
import { initializeChatInput } from './components/chatInput.js';
import { initializeMessageList, showWelcomeInterface } from './components/messageList.js';
import { initializeSettingsModal } from './components/settingsModal.js';
import { initializeWelcomeScreen } from './components/welcomeScreen.js';
import { initializeHeader } from './components/header.js';
import { initializeCreatorScreen } from './customGpt/creatorScreen.js';
import { initializeNotificationSystem } from './notificationHelper.js';
import { initializeAuthModal, showAuthModal } from './components/authModal.js';
import { initializeAuth } from './authService.js';
import { clearRealtimeState } from './state.js'; // Import the clear function

// --- DOM Elements ---
const welcomeScreenElement = document.getElementById('welcomeScreen');
const messageContainerElement = document.getElementById('messageContainer');
const imageGenPageContainer = document.getElementById('imageGenPageContainer');

/**
 * Check if user is logged in and prompt for login if not
 */
async function checkAndPromptLogin() {
    const currentUser = state.getCurrentUserState();
    
    // If no user is logged in and it's a first visit (or hasn't been prompted recently)
    if (!currentUser && !localStorage.getItem('login_prompted')) {
        // Show auth modal
        showAuthModal();
        
        // Set flag to avoid repeated prompting in the same session
        localStorage.setItem('login_prompted', 'true');
        
        // Optionally, set this flag to expire after some time
        setTimeout(() => {
            localStorage.removeItem('login_prompted');
        }, 7 * 24 * 60 * 60 * 1000); // 7 days
    }
}

/**
 * Main application entry point.
 * Initializes state, components, and sets the initial UI view.
 */
async function initializeApp() {
    console.log("Initializing App...");

    // --- ADDED: Ensure clean real-time state on load ---
    clearRealtimeState(); 
    console.log("Initial real-time state explicitly cleared.");
    // --- END ADDED ---
    
    // Initialize notification system first so it's available to other components
    initializeNotificationSystem();

    // Initialize Supabase auth
    await initializeAuth();

    // Load general settings
    await state.loadSettings();

    // Initialize Core Components
    initializeSidebar();
    initializeChatInput();
    initializeMessageList();
    initializeSettingsModal();
    initializeWelcomeScreen();
    initializeHeader();
    initializeCreatorScreen();
    initializeAuthModal();
    initializeImageGenPage(); // Initialize the image generation page
    
    // Check if user should be prompted to login
    setTimeout(checkAndPromptLogin, 1000); // Delay slightly for better UX

    // Set initial view
    const activeGpt = state.getActiveCustomGptConfig();
    
    // Rest of your initialization code...
}

/**
 * Central function to show a specific view and hide others.
 * @param {string} viewId - The ID of the view to show ('chat', 'welcome', 'imageGenPage').
 */
export function showView(viewId) {
    // Get references to all main view containers
    const views = [
        { id: 'welcome', element: welcomeScreenElement },
        { id: 'chat', element: messageContainerElement },
        { id: 'imageGenPage', element: imageGenPageContainer }
    ];

    views.forEach(view => {
        if (view.element) {
            view.element.style.display = view.id === viewId ? (viewId === 'chat' ? 'flex' : 'block') : 'none';
        }
    });
}


// Call init when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
