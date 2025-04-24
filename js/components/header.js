// ===== FILE: js/components/header.js =====
import * as state from '../state.js';
import { showNotification } from '../notificationHelper.js';
import { updateInputUIForModel, removeImagePreview, renderFilePreviews, clearMessageInput } from './chatInput.js';
import { openSettings, updateSettingsModalSelect } from './settingsModal.js';
import { handleNewChat as sidebarHandleNewChat, renderChatList, renderCustomGptList } from './sidebar.js';
import { clearMessageListUI, showWelcomeInterface } from './messageList.js';

// --- DOM Elements ---
const headerModelSelectElement = document.getElementById('headerModelSelect'); // Default model selector
const activeGptDisplayElement = document.getElementById('activeGptDisplay'); // Span for active GPT name
const headerSettingsBtnElement = document.getElementById('headerSettingsBtn');
const headerNewChatBtnElement = document.getElementById('headerNewChatBtn'); // <<< NEW: Header New Chat Button

// --- Header Logic ---

/**
 * Handles changes in the header *default* model select dropdown.
 * This only changes the setting used when NO custom GPT is active.
 */
function handleHeaderModelChange(event) {
    const newDefaultModel = event.target.value;
    console.log(`Header DEFAULT model selection changed to: ${newDefaultModel}`);

    const currentApiKey = state.getApiKey();
    const currentTtsInstructions = state.getTtsInstructions();
    const currentGeminiApiKey = state.getGeminiApiKey(); // Get current Gemini API key
    const currentXaiApiKey = state.getXaiApiKey(); // Get current X.AI API key

    state.saveSettings(currentApiKey, newDefaultModel, currentTtsInstructions, currentGeminiApiKey, currentXaiApiKey);

    if (!state.getActiveCustomGptConfig()) {
        updateInputUIForModel();
    }

    updateSettingsModalSelect(newDefaultModel);
}

/**
 * Updates the header dropdown's selected value (for the *default* model).
 * Called from settingsModal when the *default* model is changed there.
 * @param {string} newModelValue - The new default model value (e.g., 'gpt-4o').
 */
export function updateHeaderModelSelect(newModelValue) {
    if (headerModelSelectElement) {
        headerModelSelectElement.value = newModelValue;
        console.log(`Header default model dropdown synchronized to: ${newModelValue}`);
    }
}

/**
 * Updates the display in the header to show the active Custom GPT name
 * or the default model selector.
 */
export function updateActiveGptDisplay() {
    if (!activeGptDisplayElement || !headerModelSelectElement) {
        console.error("Header display elements not found.");
        return;
    }

    const activeGpt = state.getActiveCustomGptConfig();

    if (activeGpt) {
        // A Custom GPT is active
        activeGptDisplayElement.textContent = ` / ${activeGpt.name}`; // Prepend with '/' for visual separation
        activeGptDisplayElement.title = activeGpt.description || activeGpt.name; // Tooltip
        activeGptDisplayElement.style.display = 'inline'; // Show the name
        headerModelSelectElement.style.display = 'inline';
        console.log(`Header updated: Active Custom GPT "${activeGpt.name}"`);

        // Determine the correct model string for UI update (should usually be gpt-4o for custom GPTs)
        const effectiveModelForUI = 'gpt-4o'; // Assume custom GPTs use gpt-4o features
        updateInputUIForModel(effectiveModelForUI); // Pass the model string

    } else {
        // No Custom GPT active - show default model selector
        activeGptDisplayElement.textContent = '';
        activeGptDisplayElement.style.display = 'none'; // Hide the span
        headerModelSelectElement.style.display = 'inline-block'; // Ensure default selector is visible
        console.log("Header updated: No active Custom GPT.");

        // Update input UI based on the actual *default* model selected
        updateInputUIForModel(state.getSelectedModelSetting()); // Pass the default model string
    }
}

/**
 * Starts a new chat session, preserving the currently active Custom GPT if one is selected.
 */
function handleHeaderNewChat() {
    const activeGpt = state.getActiveCustomGptConfig();

    if (activeGpt) {
        console.log(`Starting new chat with active Custom GPT: ${activeGpt.name}`);
        // Save current chat if needed (logic might be different than sidebar's handleAutoSave)
        // For now, just clear the state but keep the GPT active
        state.clearChatHistory(); // Clears history, files, activeChatId
        clearMessageListUI();
        removeImagePreview();
        renderFilePreviews();
        clearMessageInput();
        showWelcomeInterface(); // Show welcome screen for the active GPT
        // No need to updateInputUIForModel as the model context (GPT-4o) remains the same
        // No need to updateActiveGptDisplay as the GPT remains active
        renderChatList(); // Update chat list (unhighlight active chat)
        // renderCustomGptList(); // GPT list highlight remains the same
        // Do not toggle sidebar
        showNotification(`New chat started with ${activeGpt.name}`, 'info', 1500);
    } else {
        console.log("Starting new default chat via header button.");
        // If no custom GPT is active, use the standard new chat logic from the sidebar
        sidebarHandleNewChat();
    }
}

// --- Initialization ---

/**
 * Initializes header components, including default model selector and active GPT display.
 */
export function initializeHeader() {
    // Initialize Default Model Selector
    if (headerModelSelectElement) {
        const currentDefaultModel = state.getSelectedModelSetting();
        headerModelSelectElement.value = currentDefaultModel;
        headerModelSelectElement.addEventListener('change', handleHeaderModelChange);
        console.log("Header default model selector initialized.");
    } else {
        console.error("Header default model select element ('headerModelSelect') not found.");
    }

    // Initialize Active GPT Display Area
    if (!activeGptDisplayElement) {
        console.error("Active GPT display element ('activeGptDisplay') not found.");
    }

    // Initialize Header Settings Button
    if (headerSettingsBtnElement) {
        headerSettingsBtnElement.addEventListener('click', openSettings); // Call imported function
        console.log("Header settings button listener attached.");
    } else {
        console.error("Header settings button element ('headerSettingsBtn') not found.");
    }

    // <<< NEW: Initialize Header New Chat Button >>>
    if (headerNewChatBtnElement) {
        headerNewChatBtnElement.addEventListener('click', handleHeaderNewChat);
        console.log("Header new chat button listener attached.");
    } else {
        console.error("Header new chat button element ('headerNewChatBtn') not found.");
    }

    // Set initial header state based on whether a GPT is active
    updateActiveGptDisplay();

    console.log("Header Initialized.");
}