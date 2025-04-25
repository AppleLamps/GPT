// ===== FILE: js/components/settingsModal.js =====
import * as state from '../state.js';
import { showNotification } from './notification.js';
import { updateInputUIForModel } from './chatInput.js';
import { updateHeaderModelSelect } from './header.js';
import { signOut } from '../authService.js';
import { showAuthModal } from './authModal.js';

// --- DOM Elements ---
const settingsModalElement = document.getElementById('settingsModal');
// General Settings Elements
const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect'); // Default model select
const ttsInstructionsInput = document.getElementById('ttsInstructionsInput'); // Select the textarea
const ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
const geminiApiKeyInput = document.getElementById('geminiApiKey');
const xaiApiKeyInput = document.getElementById('xaiApiKey');
const enableHtmlSandboxCheckbox = document.getElementById('enableHtmlSandbox');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
// Modal Control Elements
const closeModalBtn = document.getElementById('closeModalBtn');
// Buttons that trigger opening the modal
const settingsBtnSidebar = document.getElementById('settingsBtn');
const modelBtnToolbar = document.getElementById('modelButton');
// <<< NEW: Header settings button selector >>>
const headerSettingsBtn = document.getElementById('headerSettingsBtn'); // Add this if not already present elsewhere

// Settings Modal Component
class SettingsModal {
    constructor() {
        // Initialize DOM elements
        this.modal = document.getElementById('settingsModal');
        this.tabs = document.querySelectorAll('.settings-tab');
        this.tabContents = document.querySelectorAll('.settings-tab-content');
        this.apiKeyInputs = document.querySelectorAll('.api-key-input');
        this.modelSelect = document.getElementById('modelSelect');
        this.ttsInstructionsInput = document.getElementById('ttsInstructions');
        this.sandboxToggle = document.getElementById('sandboxToggle');
        this.saveButton = document.getElementById('saveSettingsButton');
        this.closeButton = document.querySelector('.modal-close');

        // Bind methods to maintain 'this' context
        this.handleTabClick = this.handleTabClick.bind(this);
        this.handleApiKeyToggle = this.handleApiKeyToggle.bind(this);
        this.handleSave = this.handleSave.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleModalClick = this.handleModalClick.bind(this);

        this.initializeEventListeners();
        this.initializeApiKeyValidation();
    }

    initializeEventListeners() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', this.handleTabClick);
        });

        // API key show/hide toggles
        document.querySelectorAll('.api-key-toggle').forEach(toggle => {
            toggle.addEventListener('click', this.handleApiKeyToggle);
        });

        // Save settings
        this.saveButton.addEventListener('click', this.handleSave);

        // Close modal
        this.closeButton.addEventListener('click', this.handleClose);

        // Close on overlay click
        this.modal.addEventListener('click', this.handleModalClick);
    }

    handleTabClick(event) {
        const tab = event.target.closest('.settings-tab');
        if (!tab) return;
        const tabId = tab.dataset.tab;
        this.switchTab(tabId);
    }

    handleApiKeyToggle(event) {
        const container = event.target.closest('.api-key-input-container');
        const input = container.querySelector('.api-key-input');
        const icon = event.target.querySelector('i');
        
        if (input.type === 'password') {
            input.type = 'text';
            icon.textContent = 'visibility_off';
        } else {
            input.type = 'password';
            icon.textContent = 'visibility';
        }
    }

    handleModalClick(event) {
        if (event.target === this.modal) {
            this.close();
        }
    }

    initializeApiKeyValidation() {
        this.apiKeyInputs.forEach(input => {
            input.addEventListener('input', () => this.validateApiKey(input));
            input.addEventListener('blur', () => this.validateApiKey(input));
        });
    }

    switchTab(tabId) {
        if (!tabId) return;
        
        this.tabs.forEach(tab => {
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        this.tabContents.forEach(content => {
            if (content.id === tabId) {
                content.style.display = 'block';
            } else {
                content.style.display = 'none';
            }
        });
    }

    validateApiKey(input) {
        const container = input.closest('.api-key-input-container');
        const indicator = container.querySelector('.api-key-validation-indicator');
        if (!indicator) return;
        
        // Basic validation - check if the key matches expected format
        const isValid = this.isValidApiKey(input.value, input.dataset.provider);
        
        indicator.classList.toggle('valid', isValid);
        indicator.classList.toggle('error', !isValid && input.value.length > 0);
        input.classList.toggle('error', !isValid && input.value.length > 0);

        // Add checkmark or x icon
        indicator.innerHTML = isValid && input.value.length > 0 ? '✓' : input.value.length > 0 ? '✕' : '';
    }

    isValidApiKey(key, provider) {
        if (!key) return true; // Empty key is considered valid (optional)
        
        const patterns = {
            'openai': /^sk-[A-Za-z0-9]{48}$/,
            'gemini': /^[A-Za-z0-9-_]{39}$/,
            'xai': /^[A-Za-z0-9-_]{64}$/
        };

        return patterns[provider]?.test(key) ?? true;
    }

    async handleSave() {
        const settings = {
            apiKey: document.getElementById('apiKey').value.trim(),
            geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
            xaiApiKey: document.getElementById('xaiApiKey').value.trim(),
            defaultModel: this.modelSelect.value,
            ttsInstructions: this.ttsInstructionsInput.value.trim(),
            enableSandbox: this.sandboxToggle.checked
        };

        try {
            // Save settings to local storage without validation
            // API keys will be validated when actually using the models, not during settings save
            Object.entries(settings).forEach(([key, value]) => {
                localStorage.setItem(key, value);
            });

            // Update UI components
            updateInputUIForModel(settings.defaultModel);
            updateHeaderModelSelect(settings.defaultModel);

            showNotification('Settings saved successfully', 'success');
            
            // Close modal after short delay
            setTimeout(() => this.close(), 1500);
        } catch (error) {
            showNotification(error.message, 'error');
            console.error('Error saving settings:', error);
        }
    }

    async open() {
        // Load current settings
        const currentSettings = await state.loadSettings();
        
        document.getElementById('apiKey').value = currentSettings.apiKey || '';
        document.getElementById('geminiApiKey').value = currentSettings.geminiApiKey || '';
        document.getElementById('xaiApiKey').value = currentSettings.xaiApiKey || '';
        this.modelSelect.value = currentSettings.defaultModel || 'gpt-4o';
        this.ttsInstructionsInput.value = currentSettings.ttsInstructions || '';
        this.sandboxToggle.checked = currentSettings.enableSandbox || false;

        // Show first tab by default
        this.switchTab('api-keys');
        
        // Show modal
        this.modal.style.display = 'flex';
        
        // Validate API keys
        this.apiKeyInputs.forEach(input => this.validateApiKey(input));
    }

    close() {
        this.modal.style.display = 'none';
    }

    handleClose() {
        this.close();
    }
}

// Create and export singleton instance
const settingsModal = new SettingsModal();
export { settingsModal };

/**
 * Toggles the visibility of the settings modal.
 * @param {boolean} visible - Whether the modal should be visible.
 */
function toggleSettingsModal(visible) {
    settingsModalElement?.classList.toggle('visible', visible);
}

/**
 * Updates the user info section in the settings modal
 */
function updateUserInfoInSettings() {
    const user = state.getCurrentUserState();
    const userInfoSection = document.getElementById('userInfoSection');
    
    if (!userInfoSection) return;
    
    if (user) {
        userInfoSection.innerHTML = `
            <h3>Account</h3>
            <div class="user-info" style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <div class="user-email">Signed in as: <strong>${user.email}</strong></div>
                <button id="logoutFromSettings" class="secondary-button">Sign Out</button>
            </div>
        `;
        
        // Add logout handler
        document.getElementById('logoutFromSettings')?.addEventListener('click', async () => {
            try {
                await signOut();
                showNotification('Signed out successfully', 'success');
                updateUserInfoInSettings();
                closeSettings();
            } catch (error) {
                showNotification('Error signing out: ' + error.message, 'error');
            }
        });
    } else {
        userInfoSection.innerHTML = `
            <h3>Account</h3>
            <div class="user-info" style="margin-top: 8px;">
                <div class="not-signed-in">Not signed in</div>
                <p style="margin-top: 4px; margin-bottom: 12px;">Sign in to sync your settings, chats, and custom GPTs across devices.</p>
                <button id="loginFromSettings" class="primary-button">Sign In</button>
            </div>
        `;
        
        // Add login handler
        document.getElementById('loginFromSettings')?.addEventListener('click', () => {
            closeSettings();
            showAuthModal();
        });
    }
}

/**
 * Loads the current GENERAL settings from state into the modal form fields.
 */
async function loadGeneralSettingsIntoForm() {
    // Changed to await the Promise returned by loadSettings
    const currentSettings = await state.loadSettings();
    
    // Handle both old and new input fields
    const apiKeyOld = document.getElementById('apiKey_old');
    const geminiApiKeyOld = document.getElementById('geminiApiKey_old');
    const xaiApiKeyOld = document.getElementById('xaiApiKey_old');
    
    // Set values for new inputs
    if (apiKeyInput) apiKeyInput.value = currentSettings.apiKey || '';
    if (modelSelect) modelSelect.value = currentSettings.model || 'gpt-4o';
    if (ttsInstructionsInput) ttsInstructionsInput.value = currentSettings.ttsInstructions || '';
    if (ttsVoiceSelect) ttsVoiceSelect.value = currentSettings.ttsVoice || 'alloy';
    if (geminiApiKeyInput) geminiApiKeyInput.value = currentSettings.geminiApiKey || '';
    if (xaiApiKeyInput) xaiApiKeyInput.value = currentSettings.xaiApiKey || '';
    if (enableHtmlSandboxCheckbox) enableHtmlSandboxCheckbox.checked = currentSettings.enableHtmlSandbox;
    
    // Set values for old inputs
    if (apiKeyOld) apiKeyOld.value = currentSettings.apiKey || '';
    if (geminiApiKeyOld) geminiApiKeyOld.value = currentSettings.geminiApiKey || '';
    if (xaiApiKeyOld) xaiApiKeyOld.value = currentSettings.xaiApiKey || '';
    
    console.log("General settings loaded into form.");
}

/**
 * Handles opening the settings modal.
 * <<< This is the correct, exported version >>>
 */
export async function openSettings() {
    await loadGeneralSettingsIntoForm(); // Load API Key, Default Model, TTS Instructions
    updateUserInfoInSettings(); // Update user info section

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
 * Handles saving only the GENERAL settings (API Keys, Default Model, TTS Instructions).
 */
function handleGeneralSettingsSave() {
    // Get values from new inputs first, fall back to old inputs if needed
    const apiKeyOld = document.getElementById('apiKey_old');
    const geminiApiKeyOld = document.getElementById('geminiApiKey_old');
    const xaiApiKeyOld = document.getElementById('xaiApiKey_old');
    
    // Prefer new inputs, fall back to old inputs
    const newApiKey = (apiKeyInput?.value.trim() || apiKeyOld?.value.trim() || '');
    const newModel = modelSelect?.value ?? 'gpt-4o';
    const newTtsInstructions = ttsInstructionsInput?.value.trim() ?? '';
    const newTtsVoice = ttsVoiceSelect?.value ?? 'alloy';
    const newGeminiApiKey = (geminiApiKeyInput?.value.trim() || geminiApiKeyOld?.value.trim() || '');
    const newXaiApiKey = (xaiApiKeyInput?.value.trim() || xaiApiKeyOld?.value.trim() || '');
    const newEnableHtmlSandbox = enableHtmlSandboxCheckbox?.checked ?? false;

    state.saveSettings(newApiKey, newModel, newTtsInstructions, newGeminiApiKey, newXaiApiKey, newTtsVoice, newEnableHtmlSandbox);

    showNotification('General settings saved!', 'success');

    // Determine the effective model (might be overridden by active custom GPT)
    const activeGpt = state.getActiveCustomGptConfig();
    const effectiveModelForUI = activeGpt ? 'gpt-4o' : newModel;

    updateInputUIForModel(effectiveModelForUI);
    updateHeaderModelSelect(newModel);

    console.log("General settings saved.");
}

/**
 * Updates the settings form with current values from state.
 */
async function updateSettingsForm() {
    const settings = await state.loadSettings();
    
    if (apiKeyInput) apiKeyInput.value = settings.apiKey;
    if (modelSelect) modelSelect.value = settings.model;
    if (ttsInstructionsInput) ttsInstructionsInput.value = settings.ttsInstructions;
    if (ttsVoiceSelect) ttsVoiceSelect.value = settings.ttsVoice;
    if (geminiApiKeyInput) geminiApiKeyInput.value = settings.geminiApiKey;
    if (xaiApiKeyInput) xaiApiKeyInput.value = settings.xaiApiKey; // NEW: Set X.AI API key value

    console.log("Settings form updated.");
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
    headerSettingsBtn?.addEventListener('click', openSettings);
    
    // Listen for auth state changes to update user info
    import('../authService.js').then(({ onAuthStateChange }) => {
        onAuthStateChange(() => {
            if (settingsModalElement?.classList.contains('visible')) {
                updateUserInfoInSettings();
            }
        });
    });

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
