// MODIFIED: Removed formatContent import if it was here
import { escapeHTML } from './utils.js';
import * as events from './events.js';
import { showNotification } from './components/notification.js';
import * as state from './state.js';

// --- DOM Element Selectors ---
export const sidebar = document.getElementById('sidebar');
export const overlay = document.getElementById('overlay');
export const chatContainer = document.getElementById('chatContainer');
export const welcomeScreen = document.getElementById('welcomeScreen');
export const messageContainer = document.getElementById('messageContainer');
export const messageInput = document.getElementById('messageInput');
export const settingsModal = document.getElementById('settingsModal');

// API Key Input Elements
export const apiKeyInput = document.getElementById('apiKey');
export const geminiApiKeyInput = document.getElementById('geminiApiKey');
export const xaiApiKeyInput = document.getElementById('xaiApiKey');
export const ttsInstructionsInput = document.getElementById('ttsInstructionsInput');
export const modelSelect = document.getElementById('modelSelect'); // Keep for settings modal

export const imagePreviewContainer = document.getElementById('imagePreview');
export const imageInput = document.getElementById('imageInput');

// Custom Dropdown Elements
export const customModelDropdown = document.getElementById('customModelDropdown');
export const customModelDropdownButton = document.getElementById('customModelDropdownButton');
export const customModelDropdownList = document.getElementById('customModelDropdownList');
export const selectedModelText = document.getElementById('selectedModelText');

// Define the list of models for the custom dropdown
const models = [
    { value: 'gpt-4.5-preview', text: 'GPT-4.5' },
    { value: 'gpt-4.1', text: 'GPT-4.1' },
    { value: 'gpt-4o', text: 'GPT-4o' },
    { value: 'o3-mini-high', text: 'o3-mini' },
    { value: 'o3', text: 'o3' },
    { value: 'o4-mini', text: 'o4-mini' },
    { value: 'grok-3-latest', text: 'Grok-3' },
    { value: 'grok-3-mini', text: 'Grok-3 Mini' },
    { value: 'gemini-2.5-pro-exp-03-25', text: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash-preview-04-17', text: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash-exp', text: 'Gemini 2.0 Flash' },
];


// --- UI State & Manipulation ---

export function toggleSidebar(visible) {
    sidebar?.classList.toggle('visible', visible);
    overlay?.classList.toggle('visible', visible);
}

export function toggleSettingsModal(visible) {
    settingsModal?.classList.toggle('visible', visible);
}

export function showChatInterface() {
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (messageContainer) messageContainer.style.display = 'flex';
}

export function showWelcomeInterface() {
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    if (messageContainer) messageContainer.style.display = 'none';
    if (messageContainer) messageContainer.innerHTML = '';
    // Ensure custom dropdown shows default text on welcome screen
    if (selectedModelText) selectedModelText.textContent = 'Select Model';
}

export function loadSettingsIntoForm(settings) {
    if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
    if (modelSelect) modelSelect.value = settings.model || 'gpt-4o';
    // Update custom dropdown button text based on loaded settings
    if (selectedModelText) {
        const selectedOption = Array.from(modelSelect.options).find(option => option.value === settings.model);
        selectedModelText.textContent = selectedOption ? selectedOption.text : 'Select Model';
    }
}

export function adjustTextAreaHeight() {
    if (!messageInput) return;
    messageInput.style.height = 'auto';
    const scrollHeight = messageInput.scrollHeight;
    const maxHeight = 200;
    messageInput.style.height = (scrollHeight < maxHeight ? scrollHeight : maxHeight) + 'px';
    messageInput.style.overflowY = scrollHeight < maxHeight ? 'hidden' : 'auto';
}

export function clearMessageInput() {
    if (!messageInput) return;
    messageInput.value = '';
    adjustTextAreaHeight();
}

export function getMessageInput() {
    return messageInput?.value.trim() || '';
}

export function setMessageInputValue(text) {
    if (!messageInput) return;
    messageInput.value = text;
    adjustTextAreaHeight();
    messageInput.focus();
}

// --- Message Rendering ---

export function addUserMessage(content) {
    if (!messageContainer || !content) return;
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message-container';
    // Use escapeHTML for user input safety
    userMessage.innerHTML = `<div class="user-bubble">${escapeHTML(content)}</div>`;
    messageContainer.appendChild(userMessage);
    scrollToBottom();
}

// MODIFIED: Creates container, content set later by setAIMessageContent
export function createAIMessageContainer() {
    const aiMessage = document.createElement('div');
    aiMessage.className = 'ai-message-container';
    // Start with empty content div
    aiMessage.innerHTML = `
        <div class="ai-message-content"></div>
        <div class="ai-message-actions">
            <button class="action-button copy-button" title="Copy to clipboard">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="action-button regenerate-button" title="Regenerate response">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </button>
            </div>
    `;
    return aiMessage;
}

// REMOVED: updateAIMessageContent function deleted


// ADDED: New function to replace content
/**
 * Replaces the content of an AI message element with the provided HTML.
 * @param {HTMLElement} aiMessageElement - The container element for the AI message.
 * @param {string} htmlContent - The full HTML content to set.
 */
export function setAIMessageContent(aiMessageElement, htmlContent) {
    const contentDiv = aiMessageElement?.querySelector('.ai-message-content');
    if (contentDiv) {
        contentDiv.innerHTML = htmlContent; // Replace content
    }
    // Ensure scrolling happens after content replacement
    scrollToBottom();
}


// MODIFIED: Parameter name changed for clarity, logic remains the same (uses raw text)
export function setupMessageActions(aiMessageElement, rawContentToCopy) {
    const copyButton = aiMessageElement.querySelector('.copy-button');
    const regenerateButton = aiMessageElement.querySelector('.regenerate-button');

    if (copyButton) {
        // Pass the raw text to the copy handler
        copyButton.addEventListener('click', () => events.handleCopyClick(rawContentToCopy));
    }
    if (regenerateButton) {
        regenerateButton.addEventListener('click', () => events.handleRegenerateClick(aiMessageElement));
    }
}


export function scrollToBottom() {
    if (chatContainer) {
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 0);
    }
}

// --- Typing Indicator ---
let typingIndicatorElement = null;

export function showTypingIndicator() {
    if (!messageContainer) return;
    removeTypingIndicator();

    typingIndicatorElement = document.createElement('div');
    typingIndicatorElement.className = 'ai-message-container typing-indicator';
    typingIndicatorElement.innerHTML = '<div class="ai-message-content">Thinking...</div>';
    messageContainer.appendChild(typingIndicatorElement);
    scrollToBottom();
}

export function removeTypingIndicator() {
    if (typingIndicatorElement && messageContainer?.contains(typingIndicatorElement)) {
        messageContainer.removeChild(typingIndicatorElement);
    }
    typingIndicatorElement = null;
}


// --- Image Preview ---
export function showImagePreview(base64Image) {
    if (!imagePreviewContainer) return;
    imagePreviewContainer.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${base64Image}" alt="Preview">
            <button class="remove-image" id="removeImageBtn" title="Remove image">&times;</button>
        </div>
    `;
    const removeBtn = document.getElementById('removeImageBtn');
    removeBtn?.addEventListener('click', events.handleRemoveImageClick);
}

export function removeImagePreview() {
    if (imagePreviewContainer) {
        imagePreviewContainer.innerHTML = '';
    }
    if (imageInput) {
        imageInput.value = '';
    }
}

/**
 * Shows a notification to the user.
 * @param {string} message - The message to display.
 * @param {'info' | 'success' | 'error' | 'warning'} type - The type of notification.
 * @param {number} duration - How long to show the notification (in ms).
 */
export function displayNotification(message, type = 'info', duration = 3000) {
    showNotification(message, type, duration);
}

// --- Mobile Toolbar Handling ---
export function setupMobileOptionsClickOutside() {
    // Add a document click handler to close the mobile toolbar when clicking outside
    document.addEventListener('click', (event) => {
        const bottomToolbar = document.querySelector('.bottom-toolbar');
        const mobileToggleBtn = document.getElementById('mobileOptionsToggleBtn');
        
        // If the mobile toolbar is visible
        if (bottomToolbar && bottomToolbar.classList.contains('mobile-visible')) {
            // Check if the click is outside both the toolbar and the toggle button
            if (!bottomToolbar.contains(event.target) && 
                mobileToggleBtn !== event.target && 
                !mobileToggleBtn.contains(event.target)) {
                // Hide the toolbar
                bottomToolbar.classList.remove('mobile-visible');
            }
        }
    });
}

// Add a function to show loading states more elegantly
export function showLoadingState(element, isLoading) {
    if (isLoading) {
        element.classList.add('loading');
        element.setAttribute('aria-busy', 'true');
    } else {
        element.classList.remove('loading');
        element.setAttribute('aria-busy', 'false');
    }
}

// Add search input to sidebar
function initializeSidebarSearch() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'sidebar-search';
    searchContainer.innerHTML = `
        <input type="text" id="sidebarSearch" placeholder="Search chats & GPTs..." />
    `;
    
    const customGptListContainer = document.getElementById('customGptListContainer');
    customGptListContainer.parentNode.insertBefore(searchContainer, customGptListContainer);
    
    const searchInput = document.getElementById('sidebarSearch');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterSidebarItems(searchTerm);
    });
}

function filterSidebarItems(searchTerm) {
    const chatItems = document.querySelectorAll('.chat-list-item');
    const gptItems = document.querySelectorAll('.gpt-list-item');
    
    [...chatItems, ...gptItems].forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

// Add drag & drop file upload support
function initializeFileUpload() {
    const dropZones = [
        document.getElementById('knowledgeFileInput_creator'),
        document.getElementById('fileInput')
    ];
    
    dropZones.forEach(zone => {
        if (!zone) return;
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.add('drag-over');
        });
        
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
        });
        
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            zone.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            const validFiles = files.filter(file => {
                const validTypes = ['.txt', '.pdf', '.md'];
                return validTypes.some(type => file.name.toLowerCase().endsWith(type));
            });
            
            if (validFiles.length) {
                // Use existing file handling logic
                if (zone.id === 'knowledgeFileInput_creator') {
                    handleKnowledgeFiles(validFiles);
                } else {
                    handleChatFiles(validFiles);
                }
            }
        });
    });
}

// Help & FAQ Modal functionality
export function initializeHelpFaq() {
    const helpFaqBtn = document.getElementById('helpFAQBtn');
    const helpFaqModal = document.getElementById('helpFaqModal');
    const closeHelpFaqBtn = document.getElementById('closeHelpFaqBtn');

    if (helpFaqBtn && helpFaqModal && closeHelpFaqBtn) {
        helpFaqBtn.addEventListener('click', () => {
            helpFaqModal.classList.add('visible');
            overlay?.classList.add('visible');
        });

        closeHelpFaqBtn.addEventListener('click', () => {
            helpFaqModal.classList.remove('visible');
            overlay?.classList.remove('visible');
        });

        // Close on overlay click
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                helpFaqModal.classList.remove('visible');
                overlay.classList.remove('visible');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && helpFaqModal.classList.contains('visible')) {
                helpFaqModal.classList.remove('visible');
                overlay?.classList.remove('visible');
            }
        });
    }
}

// Initialize new features
// Initialize model button in toolbar
export function initializeModelButton() {
    const modelButton = document.getElementById('modelButton');
    if (modelButton) {
        modelButton.addEventListener('click', () => {
            // Open settings modal
            toggleSettingsModal(true);
        });
    }
}
document.addEventListener('DOMContentLoaded', () => {
    initializeSidebarSearch();
    initializeFileUpload();
    initializeHelpFaq();
    initializeCustomModelDropdown(); // Initialize the custom dropdown
    initializeModelButton(); // Initialize the model button in toolbar
    
    // Show onboarding modal for first-time users
    if (!localStorage.getItem('hasSeenOnboarding')) {
        const onboardingModal = document.getElementById('onboardingModal');
        onboardingModal.style.display = 'block';
        
        document.getElementById('startUsingApp').addEventListener('click', () => {
            onboardingModal.style.display = 'none';
            localStorage.setItem('hasSeenOnboarding', 'true');
        });
    }
});

// --- Custom Model Dropdown Logic ---

// Get the currently selected model from the custom dropdown
export function getSelectedCustomModel() {
    const selectedItem = customModelDropdownList?.querySelector('li[aria-selected="true"]');
    return selectedItem?.dataset.value || 'gpt-4o'; // Default to gpt-4o if nothing selected
}

function initializeCustomModelDropdown() {
    if (!customModelDropdownButton || !customModelDropdownList || !selectedModelText) {
        console.error("Custom model dropdown elements not found.");
        return;
    }

    // Populate the dropdown list
    customModelDropdownList.innerHTML = ''; // Clear existing content
    models.forEach(model => {
        const listItem = document.createElement('li');
        listItem.textContent = model.text;
        listItem.dataset.value = model.value;
        listItem.setAttribute('role', 'option');
        listItem.setAttribute('aria-selected', 'false');

        // Add click listener
        listItem.addEventListener('click', () => {
            selectedModelText.textContent = model.text;
            // Update application state with the selected model value
            // Get current settings
            const apiKey = state.getApiKey();
            const ttsInstructions = state.getTtsInstructions();
            const geminiApiKey = state.getGeminiApiKey();
            const xaiApiKey = state.getXaiApiKey();
            const ttsVoice = state.getTtsVoice();
            const enableHtmlSandbox = state.getIsHtmlSandboxEnabled();
            // Save new model selection to state
            state.saveSettings(apiKey, model.value, ttsInstructions, geminiApiKey, xaiApiKey, ttsVoice, enableHtmlSandbox);
            console.log("Model selected and saved to state:", model.value);
            // Hide the dropdown
            customModelDropdownList.classList.remove('visible');
            customModelDropdownButton.setAttribute('aria-expanded', 'false');
        });

        customModelDropdownList.appendChild(listItem);
    });

    // Toggle dropdown visibility
    customModelDropdownButton.addEventListener('click', () => {
        const isVisible = customModelDropdownList.classList.contains('visible');
        customModelDropdownList.classList.toggle('visible', !isVisible);
        customModelDropdownButton.setAttribute('aria-expanded', !isVisible);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (customModelDropdown && !customModelDropdown.contains(event.target)) {
            customModelDropdownList.classList.remove('visible');
            customModelDropdownButton.setAttribute('aria-expanded', 'false');
        }
    });

    // Set initial selected model text (if a default is loaded)
    // This assumes loadSettingsIntoForm is called elsewhere to set the initial model
    // For now, we can set a default or leave it as "Select Model"
    // If you have a default model value stored, you would retrieve it here
    const defaultModelValue = 'gpt-4o'; // Example default
    const defaultModel = models.find(model => model.value === defaultModelValue);
    if (defaultModel) {
        selectedModelText.textContent = defaultModel.text;
        // Mark the default option as selected in the list (optional, for accessibility)
        const defaultListItem = customModelDropdownList.querySelector(`li[data-value="${defaultModelValue}"]`);
        if (defaultListItem) {
             defaultListItem.setAttribute('aria-selected', 'true');
        }
    }
}


