// --- DOM Elements ---
const sidebarElement = document.getElementById('sidebar');
const overlayElement = document.getElementById('overlay');
const menuButton = document.getElementById('menuButton');
const newChatBtn = document.getElementById('newChatBtn');

// Chat List Container
const chatListContainer = document.getElementById('chatListContainer');

// Custom GPT Elements <<< NEW
const addCustomGptBtn = document.getElementById('addCustomGptBtn');
const customGptListContainer = document.getElementById('customGptListContainer');

// Add Export/Import elements
const gptImportInput = document.createElement('input');
gptImportInput.type = 'file';
gptImportInput.id = 'gpt-import-input';
gptImportInput.accept = '.json';
gptImportInput.hidden = true;
document.body.appendChild(gptImportInput);

// Sidebar footer buttons
const darkModeBtn = document.getElementById('darkModeBtn');
const clearConversationsBtn = document.getElementById('clearConversationsBtn');
const helpFAQBtn = document.getElementById('helpFAQBtn');
const logoutBtn = document.getElementById('logoutBtn');

// --- Dark Mode Logic ---

const DARK_MODE_KEY = 'darkModeEnabled';

function applyDarkMode(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    if (darkModeBtn) {
        // Optional: Update button text/icon/title based on state
        darkModeBtn.title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";
        const svg = darkModeBtn.querySelector('svg');
        if (svg) {
            // Simple example: Toggle between a sun and moon icon (replace with actual SVGs if available)
            if (isDark) {
                svg.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>'; // Moon
            } else {
                svg.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'; // Sun
            }
        }
    }
    console.log(`Dark Mode applied: ${isDark}`);
}

function toggleDarkModePreference() {
    const isCurrentlyDark = document.body.classList.contains('dark-mode');
    const newIsDark = !isCurrentlyDark;
    localStorage.setItem(DARK_MODE_KEY, newIsDark.toString());
    applyDarkMode(newIsDark);
}

function loadDarkModePreference() {
    const savedPreference = localStorage.getItem(DARK_MODE_KEY);
    // Default to light mode if no preference is saved or invalid value
    const isDark = savedPreference === 'true'; 
    applyDarkMode(isDark);
}

// --- End Dark Mode Logic ---

// --- Sidebar Logic ---

function toggleSidebar(visible) {
    sidebarElement?.classList.toggle('visible', visible);
    overlayElement?.classList.toggle('visible', visible);
}

function handleOverlayClick() {
    toggleSidebar(false);
}

// --- Chat History List ---
// ... (rest of existing sidebar logic: renderChatList, handleLoadChat, handleDeleteChat) ...

// --- Custom GPT List <<< NEW SECTION --- 
// ... (existing custom GPT functions: renderCustomGptList, handleLoadCustomGpt, etc.) ...

// --- General Sidebar Actions ---
// ... (existing general actions: handleAutoSaveCurrentChat, handleNewChat, handleClearAllConversations) ...

function handleNotImplemented(event) {
    const button = event.target.closest('button');
    if (!button) return;
    // Add buttons handled by delegation or specific listeners
    const handledElsewhere = [
        'newChatBtn', 'settingsBtn', 'clearConversationsBtn', 'menuButton',
        'addCustomGptBtn', 
        'darkModeBtn' // <<< Now handled by its own listener
    ];
    // Ignore clicks within list items handled by delegation
    if (button.closest('.chat-item') || button.closest('.gpt-list-item') || handledElsewhere.includes(button.id)) return;

    const buttonText = button.title || button.textContent?.trim().split('\n')[0] || button.id || 'Button';
    showNotification(`${buttonText} functionality not yet implemented.`, 'info');
}

// --- Initialization ---

export function initializeSidebar() {
    menuButton?.addEventListener('click', () => toggleSidebar(true));
    overlayElement?.addEventListener('click', handleOverlayClick);
    newChatBtn?.addEventListener('click', handleNewChat);
    addCustomGptBtn?.addEventListener('click', () => openCreatorModal(null));

    // Event delegation for CHAT list
    // ... (existing chat list delegation logic) ...

    // Event delegation for CUSTOM GPT list
    // ... (existing custom GPT list delegation logic) ...

    // Footer Buttons
    darkModeBtn?.addEventListener('click', toggleDarkModePreference); // <<< UPDATED listener
    helpFAQBtn?.addEventListener('click', handleNotImplemented); // Still not implemented
    logoutBtn?.addEventListener('click', handleNotImplemented); // Still not implemented
    clearConversationsBtn?.addEventListener('click', handleClearAllConversations); // Keep as is

    // Initial list rendering
    renderChatList();
    renderCustomGptList();
    
    // Load dark mode preference on initial load
    loadDarkModePreference(); // <<< ADDED call

    console.log("Sidebar Initialized.");
} 