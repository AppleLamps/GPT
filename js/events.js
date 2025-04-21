import * as ui from './ui.js';
import { showNotification } from './notificationHelper.js';
import * as state from './state.js';
import * as api from './api.js';
import * as utils from './utils.js';

// --- Helper Functions ---

function resetChatStateAndUI() {
    state.clearChatHistory();
    state.clearCurrentImage();
    ui.removeImagePreview();
}

// --- Event Handlers ---

function handleOverlayClick() {
    ui.toggleSidebar(false);
    // Also hide mobile toolbar overlay if shown
    const bottomToolbar = document.querySelector('.bottom-toolbar');
    if (bottomToolbar && bottomToolbar.classList.contains('mobile-visible')) {
        bottomToolbar.classList.remove('mobile-visible');
    }
}

// New function to handle mobile options toggle
function handleMobileOptionsToggle() {
    const bottomToolbar = document.querySelector('.bottom-toolbar');
    if (bottomToolbar) {
        bottomToolbar.classList.toggle('mobile-visible');
    }
}

function handleSettingsOpen() {
    const currentSettings = state.loadSettings();
    ui.loadSettingsIntoForm(currentSettings);
    ui.toggleSettingsModal(true);
}

function handleSettingsClose() {
    ui.toggleSettingsModal(false);
}

function handleSettingsSave() {
    const newApiKey = ui.apiKeyInput?.value.trim() || '';
    const newModel = ui.modelSelect?.value || 'gpt-4o';
    const newTtsInstructions = ui.ttsInstructionsInput?.value.trim() || '';
    const newGeminiApiKey = ui.geminiApiKeyInput?.value.trim() || '';
    const newXaiApiKey = ui.xaiApiKeyInput?.value.trim() || '';
    
    state.saveSettings(newApiKey, newModel, newTtsInstructions, newGeminiApiKey, newXaiApiKey);
    ui.toggleSettingsModal(false);
    showNotification('Settings saved successfully!', 'success');
}

function handleNewChat() {
    resetChatStateAndUI();
    ui.showWelcomeInterface();
    ui.toggleSidebar(false);
}

function handleSampleChatLoad() {
    resetChatStateAndUI();
    ui.showChatInterface();
    const samplePrompt = 'Tell me about Apple';
    ui.addUserMessage(samplePrompt);
    state.addMessageToHistory({ role: 'user', content: samplePrompt });
    api.fetchOpenAIResponse();
    ui.toggleSidebar(false);
}

function handleSendMessage() {
    const message = ui.getMessageInput();
    if (!message && !state.getCurrentImage()) {
        return;
    }

    ui.showChatInterface();

    if (message) {
        ui.addUserMessage(message);
        state.addMessageToHistory({ role: 'user', content: message });
    } else if (state.getCurrentImage()) {
        state.addMessageToHistory({ role: 'user', content: "" });
    }

    ui.clearMessageInput();
    api.fetchOpenAIResponse();
}

function handleMessageInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
    }
}

function handleExamplePromptClick(event) {
    if (event.target.classList.contains('example-prompt')) {
        const promptText = event.target.textContent;
        if (promptText) {
            ui.setMessageInputValue(promptText);
        }
    }
}

async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        showNotification('Please upload a JPG or PNG image.', 'error');
        state.clearCurrentImage();
        ui.removeImagePreview();
        return;
    }

    try {
        const base64Image = await utils.convertToBase64(file);
        state.setCurrentImage({ data: base64Image, name: file.name });
        ui.showImagePreview(base64Image);
        showNotification('Image ready to send with your next message.', 'success');
        ui.messageInput?.focus();
    } catch (error) {
        console.error("Error processing image:", error);
        showNotification('Error processing image.', 'error');
        state.clearCurrentImage();
        ui.removeImagePreview();
    }
}

export function handleRemoveImageClick() {
    state.clearCurrentImage();
    ui.removeImagePreview();
    // ui.showNotification('Image removed.', 'info'); // Use imported function if uncommented
}

export function handleCopyClick(contentToCopy) {
    utils.copyTextToClipboard(contentToCopy);
    showNotification('Response copied to clipboard!', 'success');
}

export function handleRegenerateClick(aiMessageElement) {
    if (aiMessageElement && ui.messageContainer?.contains(aiMessageElement)) {
        ui.messageContainer.removeChild(aiMessageElement);
    }
    state.removeLastAssistantMessageFromHistory();
    api.fetchOpenAIResponse();
}

// Central handler for delegated button clicks
function handleDelegatedClicks(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const buttonId = button.id;

    switch (buttonId) {
        // Header
        case 'menuButton':
            const isVisible = ui.sidebar?.classList.contains('visible');
            ui.toggleSidebar(!isVisible);
            break;

        // Sidebar
        case 'settingsBtn': handleSettingsOpen(); break;
        case 'newChatBtn': handleNewChat(); break;
        case 'sampleChat': handleSampleChatLoad(); break;

        // Modal
        case 'closeModalBtn': handleSettingsClose(); break;
        case 'saveSettingsBtn': handleSettingsSave(); break;

        // Mobile options
        case 'mobileOptionsToggleBtn': handleMobileOptionsToggle(); break;

        // Input area
        case 'sendButton': handleSendMessage(); break;
        case 'imageButton': ui.imageInput?.click(); break;
        case 'modelButton': handleSettingsOpen(); break; // Toolbar model button

        // Unimplemented / Placeholder
        case 'addButton':
        case 'searchButton':
        case 'researchButton':
        case 'voiceButton':
        case 'darkModeBtn':
        case 'clearConversationsBtn':
        case 'helpFAQBtn':
        case 'logoutBtn':
            const buttonText = button.title || button.textContent?.trim().split('\n')[0] || buttonId || 'Button';
            showNotification(`${buttonText} functionality not yet implemented.`, 'info');
            break;

        default: break; // Ignore others
    }
}

// --- Attach Event Listeners ---
export function initializeEventListeners() {
    document.querySelector('.main-content')?.addEventListener('click', handleDelegatedClicks);
    ui.sidebar?.addEventListener('click', handleDelegatedClicks);
    ui.settingsModal?.addEventListener('click', handleDelegatedClicks);

    ui.overlay?.addEventListener('click', handleOverlayClick);
    ui.messageInput?.addEventListener('input', ui.adjustTextAreaHeight);
    ui.messageInput?.addEventListener('keydown', handleMessageInputKeydown);
    ui.imageInput?.addEventListener('change', handleImageUpload);

    document.querySelector('.example-prompts')?.addEventListener('click', handleExamplePromptClick);

    // Setup mobile options click outside handler
    ui.setupMobileOptionsClickOutside();

    // Dynamic element listeners (copy/regenerate/remove-image) attached in ui.js
}