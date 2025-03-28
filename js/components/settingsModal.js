// ===== FILE: js/components/settingsModal.js =====
import * as state from '../state.js';
import { showNotification } from './notification.js';
import { updateInputUIForModel } from './chatInput.js';
import { updateHeaderModelSelect } from './header.js';

// --- DOM Elements ---
const settingsModalElement = document.getElementById('settingsModal');
// General Settings Elements
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect'); // Default model select
const ttsInstructionsInput = document.getElementById('ttsInstructionsInput'); // Select the textarea
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
// Modal Control Elements
const closeModalBtn = document.getElementById('closeModalBtn');
// Buttons that trigger opening the modal
const settingsBtnSidebar = document.getElementById('settingsBtn');
const modelBtnToolbar = document.getElementById('modelButton');
// <<< NEW: Header settings button selector >>>
const headerSettingsBtn = document.getElementById('headerSettingsBtn'); // Add this if not already present elsewhere

// --- Modal Logic ---

/**
 * Toggles the visibility of the settings modal.
 * @param {boolean} visible - Whether the modal should be visible.
 */
function toggleSettingsModal(visible) {
    settingsModalElement?.classList.toggle('visible', visible);
}

/**
 * Loads the current GENERAL settings from state into the modal form fields.
 */
function loadGeneralSettingsIntoForm() {
    const currentSettings = state.loadSettings(); // Returns { apiKey, model, ttsInstructions }
    if (apiKeyInput) apiKeyInput.value = currentSettings.apiKey || '';
    if (modelSelect) modelSelect.value = currentSettings.model || 'gpt-4o';
    if (ttsInstructionsInput) ttsInstructionsInput.value = currentSettings.ttsInstructions || '';
    console.log("General settings loaded into form.");
}

// <<< REMOVED the first, non-exported definition of openSettings >>>
/*
function openSettings() {
    loadGeneralSettingsIntoForm(); // Load API Key, Default Model
    toggleSettingsModal(true);
    console.log("Settings modal opened.");
}
*/

/**
 * Handles opening the settings modal.
 * <<< This is the correct, exported version >>>
 */
export function openSettings() {
    loadGeneralSettingsIntoForm(); // Load API Key, Default Model, TTS Instructions

    // Optional: Refresh Custom GPT state if applicable (though creator has its own modal)
    // prepareGptFormOnModalOpen(); // Example placeholder

    toggleSettingsModal(true);
    console.log("Settings modal opened.");
}

/**
 * Handles closing the settings modal.
 */
function closeSettings() {
    toggleSettingsModal(false);
    console.log("Settings modal closed.");
}

/**
 * Handles saving only the GENERAL settings (API Key, Default Model, TTS Instructions).
 */
function handleGeneralSettingsSave() {
    const newApiKey = apiKeyInput?.value.trim() ?? '';
    const newModel = modelSelect?.value ?? 'gpt-4o';
    const newTtsInstructions = ttsInstructionsInput?.value.trim() ?? '';

    state.saveSettings(newApiKey, newModel, newTtsInstructions);

    showNotification('General settings saved!', 'success');

    // Determine the effective model (might be overridden by active custom GPT)
    const activeGpt = state.getActiveCustomGptConfig();
    const effectiveModelForUI = activeGpt ? 'gpt-4o' : newModel;

    updateInputUIForModel(effectiveModelForUI); // Pass the model string
    updateHeaderModelSelect(newModel); // Update the default selector in header

    console.log("General settings saved.");
}

/**
 * Updates the settings modal's DEFAULT model dropdown value.
 * @param {string} newModelValue - The new default model value (e.g., 'gpt-4o').
 */
export function updateSettingsModalSelect(newModelValue) {
    if (modelSelect) {
        modelSelect.value = newModelValue;
        console.log(`Settings modal default model dropdown synchronized to: ${newModelValue}`);
    }
}

// --- Initialization ---
export function initializeSettingsModal() {
    console.log("Initializing Settings Modal (Shell & General)...");
    // Attach listeners to all buttons that should open the settings
    settingsBtnSidebar?.addEventListener('click', openSettings);
    modelBtnToolbar?.addEventListener('click', openSettings);
    // <<< Ensure the header settings button listener is added (can be here or in header.js) >>>
    // If header.js already adds it, you don't need it here. If not, add it:
    // headerSettingsBtn?.addEventListener('click', openSettings);

    // Close and Save buttons
    closeModalBtn?.addEventListener('click', closeSettings);
    saveSettingsBtn?.addEventListener('click', handleGeneralSettingsSave);

    // Close modal on overlay click
    settingsModalElement?.addEventListener('click', (event) => {
        if (event.target === settingsModalElement) {
            closeSettings();
        }
    });
    console.log("Settings Modal (Shell & General) Initialized.");
}