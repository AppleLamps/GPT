// ===== FILE: js/components/sidebar.js =====
import * as state from '../state.js';
import * as api from '../api.js';
import * as chatStore from '../chatStore.js';
import * as gptStore from '../customGpt/gptStore.js';
import { openCreatorModal } from '../customGpt/creatorScreen.js';
import { exportGpt, importGptFromFile } from "../customGpt/customGptManager.js"; // <<< NEW: Import GPT manager functions
// Import UI functions needed from other components/modules
import { showWelcomeInterface, showChatInterface, addUserMessage, renderMessagesFromHistory, clearMessageListUI } from './messageList.js';
import { removeImagePreview, updateInputUIForModel, clearMessageInput, renderFilePreviews } from './chatInput.js';
import { showNotification } from '../notificationHelper.js';
import { escapeHTML } from '../utils.js';
import { updateActiveGptDisplay } from './header.js'; // <<< NEW: To update header on load
import { showConfirmDialog } from './dialog.js';

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

// --- Sidebar Logic ---

function toggleSidebar(visible) {
    sidebarElement?.classList.toggle('visible', visible);
    overlayElement?.classList.toggle('visible', visible);
}

function handleOverlayClick() {
    toggleSidebar(false);
}

// --- Chat History List ---

function renderChatList() {
    if (!chatListContainer) {
        console.error("Chat list container not found in sidebar.");
        return;
    }
    const chats = chatStore.getChatList(); // Gets sorted list (newest first)
    chatListContainer.innerHTML = ''; // Clear previous list

    if (chats.length === 0) { return; }

    const activeChatId = state.getActiveChatId();

    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
        item.dataset.chatId = chat.id;

        item.innerHTML = `
            <div class="chat-avatar">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </div>
            <div class="chat-title">${escapeHTML(chat.title)}</div>
            <div class="chat-options">
                 <button class="delete-chat-button" title="Delete Chat" data-chat-id="${chat.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                 </button>
            </div>
        `;
        chatListContainer.appendChild(item);
    });
}

function handleLoadChat(chatId) {
    console.log("Attempting to load chat:", chatId);
    const history = chatStore.loadChat(chatId);
    if (history) {
        // Check if switching *from* a Custom GPT
        const wasCustomGptActive = !!state.getActiveCustomGptConfig();

        state.clearLastGeneratedImageUrl();
        state.setActiveChat(history, chatId); // Clears files, sets history, sets activeChatId
        // Ensure Custom GPT is cleared if we are loading a regular chat
        if (wasCustomGptActive) {
            state.clearActiveCustomGptConfig();
            updateActiveGptDisplay(); // Update header to show no active GPT
        }

        clearMessageListUI();
        renderMessagesFromHistory(history);
        removeImagePreview();
        renderFilePreviews();
        clearMessageInput();
        updateInputUIForModel();
        showChatInterface();
        renderChatList(); // Highlight active chat
        renderCustomGptList(); // Unhighlight active GPT if needed
        toggleSidebar(false);
    } else {
        showNotification("Failed to load chat.", 'error');
        // Optionally remove broken chat ID from list?
    }
}


function handleDeleteChat(chatId) {
    const chatList = chatStore.getChatList();
    const chatToDelete = chatList.find(c => c.id === chatId);
    const titleToDelete = chatToDelete ? `"${chatToDelete.title}"` : `this chat (ID: ${chatId})`;

    showConfirmDialog(`Are you sure you want to delete the chat ${titleToDelete}?`, 
        () => {
            const deleted = chatStore.deleteChat(chatId);
            if (deleted) {
                showNotification('Chat deleted.', 'success', 1500);
                
                if (state.getActiveChatId() === chatId) {
                    state.clearChatHistory(); 
                    state.clearActiveCustomGptConfig();
                    updateActiveGptDisplay();
                    showWelcomeInterface();
                }
                renderChatList();
                renderCustomGptList();
            } else {
                showNotification('Failed to delete chat.', 'error');
            }
        }
    );
}


// --- Custom GPT List <<< NEW SECTION ---

/**
 * Renders the list of saved Custom GPTs in the sidebar.
 */
export function renderCustomGptList() { // <<< EXPORTED
    if (!customGptListContainer) {
        console.error("Custom GPT list container not found.");
        return;
    }
    const configs = gptStore.getConfigList(); // Assumes sorted by name
    customGptListContainer.innerHTML = ''; // Clear previous list

    // Add export/import buttons at the top
    const actionButtons = document.createElement('div');
    actionButtons.className = 'gpt-action-buttons';
    actionButtons.style.cssText = 'display: flex; gap: 8px; padding: 0 8px 8px 8px;';
    actionButtons.innerHTML = `
        <button id="exportGptButton" class="settings-button" style="flex: 1; font-size: 13px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export
        </button>
        <button id="importGptButton" class="settings-button" style="flex: 1; font-size: 13px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Import
        </button>
        <input type="file" id="gpt-import-input" accept=".json" style="display: none;">
    `;
    customGptListContainer.appendChild(actionButtons);

    // Set up event listeners for the buttons
    const exportBtn = actionButtons.querySelector('#exportGptButton');
    const importBtn = actionButtons.querySelector('#importGptButton');
    const importInput = actionButtons.querySelector('#gpt-import-input');

    exportBtn.addEventListener('click', () => {
        if (window.selectedGptId) {
            exportGpt(window.selectedGptId);
        } else {
            showNotification('Please select a GPT to export', 'warning');
        }
    });

    importBtn.addEventListener('click', () => {
        importInput.click();
    });

    importInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        importGptFromFile(file, () => {
            showNotification('GPT imported successfully', 'success');
            renderCustomGptList(); // Refresh the list
        });
    });

    if (configs.length === 0) {
        return;
    }

    const activeGptId = state.getActiveCustomGptConfig()?.id;

    configs.forEach(config => {
        const item = document.createElement('div');
        // Add 'active' class if this config is the currently active one
        item.className = `gpt-list-item ${config.id === activeGptId ? 'active' : ''}`;
        item.dataset.gptId = config.id;
        item.title = config.description || config.name; // Tooltip

        // Simplified structure, add icons later if desired
        item.innerHTML = `
            <div class="gpt-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M12 3a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9 9 9 0 0 0-9-9Z"></path>
                    <path d="m9 9 6 6"></path>
                    <path d="m15 9-6 6"></path>
                </svg>
            </div>
            <div class="gpt-name">${escapeHTML(config.name)}</div>
            <div class="gpt-list-item-actions">
                 <button class="gpt-list-action-button edit-gpt-button" title="Edit GPT" data-gpt-id="${config.id}">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                 </button>
                 <button class="gpt-list-action-button delete-gpt-button delete" title="Delete GPT" data-gpt-id="${config.id}">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                 </button>
            </div>
        `;
        customGptListContainer.appendChild(item);
    });
}

/**
 * Handles clicking on a Custom GPT item to load it.
 * @param {string} gptId - The ID of the Custom GPT to load.
 */
function handleLoadCustomGpt(gptId) {
    console.log(`Attempting to load Custom GPT: ${gptId}`);
    const config = gptStore.loadConfig(gptId);
    if (config) {
        // Track selected GPT ID globally
        window.selectedGptId = gptId;

        // Save current chat before switching (if applicable)
        handleAutoSaveCurrentChat();

        // Set the new active config
        state.setActiveCustomGptConfig(config);
        
        // Clear existing chat state and UI for the new GPT context
        state.clearLastGeneratedImageUrl();
        state.clearChatHistory(); // This resets activeChatId to null
        clearMessageListUI();
        removeImagePreview();
        renderFilePreviews();
        clearMessageInput();
        showWelcomeInterface(); // Start with welcome screen for the loaded GPT
        updateInputUIForModel(); // Update based on GPT-4o (usually)
        updateActiveGptDisplay(); // Update header display
        renderCustomGptList(); // Highlight active GPT
        renderChatList(); // Unhighlight any active chat
        toggleSidebar(false);
        showNotification(`Switched to Custom GPT: ${config.name}`, 'success');
    } else {
        showNotification("Failed to load Custom GPT.", "error");
        // Optionally clear active GPT state if load fails?
        // state.clearActiveCustomGptConfig();
        // updateActiveGptDisplay();
        // renderCustomGptList();
    }
}

/**
 * Handles clicking the "Edit" button for a Custom GPT.
 * @param {string} gptId - The ID of the Custom GPT to edit.
 */
function handleEditCustomGpt(gptId) {
    console.log(`Attempting to edit Custom GPT: ${gptId}`);
    const config = gptStore.loadConfig(gptId);
    if (config) {
        openCreatorModal(config); // Open the modal pre-filled for editing
        // No need to close sidebar here
    } else {
        showNotification("Could not load GPT data for editing.", "error");
    }
}

/**
 * Handles clicking the "Delete" button for a Custom GPT.
 * @param {string} gptId - The ID of the Custom GPT to delete.
 */
function handleDeleteCustomGpt(gptId) {
    const configList = gptStore.getConfigList();
    const configToDelete = configList.find(c => c.id === gptId);
    const nameToDelete = configToDelete ? `"${configToDelete.name}"` : `this Custom GPT (ID: ${gptId})`;

    showConfirmDialog(`Are you sure you want to delete ${nameToDelete}? This cannot be undone.`, 
        () => {
            const deleted = gptStore.deleteConfig(gptId);
            if (deleted) {
                showNotification('Custom GPT deleted.', 'success', 1500);
                
                // If the deleted GPT was the active one, clear state and UI
                if (state.getActiveCustomGptConfig()?.id === gptId) {
                    state.clearActiveCustomGptConfig();
                    updateActiveGptDisplay(); 
                    state.clearChatHistory();
                    showWelcomeInterface();
                    updateInputUIForModel();
                }
                renderCustomGptList();
            } else {
                showNotification('Failed to delete Custom GPT.', 'error');
            }
        }
    );
}

// --- General Sidebar Actions ---

/**
 * Saves the current active chat session before switching contexts (e.g., new chat, load chat, load GPT).
 */
function handleAutoSaveCurrentChat() {
    const currentHistory = state.getChatHistory();
    const currentActiveChatId = state.getActiveChatId();

    if (currentHistory.length > 0) {
        // Don't save if chat belongs to a Custom GPT session (we clear history when switching GPTs)
        // Or, if we want separate histories per GPT, this needs more complex logic
        // For now, assume we only save "default" chats
        if (!state.getActiveCustomGptConfig()) {
            console.log(`Auto-saving current chat (ID: ${currentActiveChatId || 'New'}) before switching.`);
            const savedMeta = chatStore.saveChat(currentHistory, currentActiveChatId);
            if (!savedMeta && currentHistory.length > 0) {
                showNotification("Could not auto-save the previous chat.", "warning");
            }
            // No need to update state here, as we are switching away
        } else {
            console.log("Skipping auto-save for Custom GPT chat session.");
        }
    }
}


function handleNewChat() {
    // Save the previous chat if it was a regular chat and had content
    handleAutoSaveCurrentChat();

    // Clear the active Custom GPT if one was active
    if (state.getActiveCustomGptConfig()) {
        state.clearActiveCustomGptConfig();
        updateActiveGptDisplay(); // Update header
        console.log("Switched back to default chat behavior.");
    }

    // Clear the state for the new chat session
    state.clearChatHistory(); // Clears files, images, history, activeChatId
    removeImagePreview();
    renderFilePreviews();
    clearMessageInput();
    clearMessageListUI();
    showWelcomeInterface();
    updateInputUIForModel(); // Update for default model
    renderChatList(); // Unhighlight active chat
    renderCustomGptList(); // Unhighlight active GPT
    toggleSidebar(false);
}

function handleClearAllConversations() {
    showConfirmDialog("Are you sure you want to delete ALL saved CHAT conversations? Custom GPT configurations will NOT be deleted. This cannot be undone.", 
        () => {
            if (chatStore.deleteAllChats()) {
                // If active chat was a saved one, clear state
                if (state.getActiveChatId()) {
                    state.clearChatHistory(); // Reset active state
                }
                // Keep active Custom GPT if any
                showWelcomeInterface();
                renderChatList(); // Update sidebar (should be empty)
                showNotification("All chat conversations deleted.", "success");
                toggleSidebar(false);
            } else {
                showNotification("Failed to delete all chat conversations.", "error");
            }
        }
    );
}

function handleNotImplemented(event) {
    const button = event.target.closest('button');
    if (!button) return;
    // Add buttons handled by delegation or specific listeners
    const handledElsewhere = [
        'newChatBtn', 'settingsBtn', 'clearConversationsBtn', 'menuButton',
        'addCustomGptBtn', // Handled specifically
    ];
    // Ignore clicks within list items handled by delegation
    if (button.closest('.chat-item') || button.closest('.gpt-list-item') || handledElsewhere.includes(button.id)) return;

    const buttonText = button.title || button.textContent?.trim().split('\n')[0] || button.id || 'Button';
    showNotification(`${buttonText} functionality not yet implemented.`, 'info');
}

// --- Initialization ---

export function initializeSidebar() {
    menuButton?.addEventListener('click', () => toggleSidebar(true));
    overlayElement?.addEventListener('click', () => toggleSidebar(false));
    newChatBtn?.addEventListener('click', handleNewChat);
    addCustomGptBtn?.addEventListener('click', () => openCreatorModal(null)); // <<< Open creator for NEW

    // Event delegation for CHAT list
    if (chatListContainer) {
        chatListContainer.addEventListener('click', (event) => {
            const chatItem = event.target.closest('.chat-item');
            const deleteButton = event.target.closest('.delete-chat-button');

            if (deleteButton) {
                event.stopPropagation();
                const chatId = deleteButton.dataset.chatId;
                if (chatId) handleDeleteChat(chatId);
            } else if (chatItem) {
                const chatId = chatItem.dataset.chatId;
                if (chatId) handleLoadChat(chatId);
            }
        });
    }

    // Event delegation for CUSTOM GPT list <<< NEW
    if (customGptListContainer) {
        customGptListContainer.addEventListener('click', (event) => {
            const gptItem = event.target.closest('.gpt-list-item');
            const editButton = event.target.closest('.edit-gpt-button');
            const deleteButton = event.target.closest('.delete-gpt-button');

            if (editButton) {
                event.stopPropagation();
                const gptId = editButton.dataset.gptId;
                if (gptId) handleEditCustomGpt(gptId);
            } else if (deleteButton) {
                event.stopPropagation();
                const gptId = deleteButton.dataset.gptId;
                if (gptId) handleDeleteCustomGpt(gptId);
            } else if (gptItem) {
                const gptId = gptItem.dataset.gptId;
                if (gptId) handleLoadCustomGpt(gptId);
            }
        });
    }

    // Footer Buttons
    darkModeBtn?.addEventListener('click', handleNotImplemented);
    helpFAQBtn?.addEventListener('click', handleNotImplemented);
    logoutBtn?.addEventListener('click', handleNotImplemented);
    clearConversationsBtn?.addEventListener('click', handleClearAllConversations);

    // Initial list rendering
    renderChatList();
    renderCustomGptList(); // <<< Render GPT list on load
    console.log("Sidebar Initialized.");
}

// Export necessary functions
export { toggleSidebar }; // renderCustomGptList already exported

// Track selected GPT ID globally
window.selectedGptId = null;