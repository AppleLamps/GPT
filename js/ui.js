// MODIFIED: Removed formatContent import if it was here
import { escapeHTML } from './utils.js';
import * as events from './events.js';

// --- DOM Element Selectors ---
export const sidebar = document.getElementById('sidebar');
export const overlay = document.getElementById('overlay');
export const chatContainer = document.getElementById('chatContainer');
export const welcomeScreen = document.getElementById('welcomeScreen');
export const messageContainer = document.getElementById('messageContainer');
export const messageInput = document.getElementById('messageInput');
export const settingsModal = document.getElementById('settingsModal');
export const apiKeyInput = document.getElementById('apiKey');
export const modelSelect = document.getElementById('modelSelect');
export const imagePreviewContainer = document.getElementById('imagePreview');
export const imageInput = document.getElementById('imageInput');

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
}

export function loadSettingsIntoForm(settings) {
    if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
    if (modelSelect) modelSelect.value = settings.model || 'gpt-4o';
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

// --- Notifications ---
export function showNotification(message, type = 'info') {
    const notificationContainer = document.createElement('div');
    notificationContainer.className = `notification ${type}`;
    
    notificationContainer.innerHTML = `
        <div class="notification-content">${message}</div>
        <button class="notification-close">&times;</button>
    `;
    
    document.body.appendChild(notificationContainer);
    
    // Add animation class after a small delay to trigger the animation
    setTimeout(() => {
        notificationContainer.classList.add('visible');
    }, 10);
    
    // Set up the close button
    const closeButton = notificationContainer.querySelector('.notification-close');
    closeButton?.addEventListener('click', () => {
        notificationContainer.classList.remove('visible');
        setTimeout(() => {
            document.body.removeChild(notificationContainer);
        }, 300); // Match the CSS transition duration
    });
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
        if (document.body.contains(notificationContainer)) {
            notificationContainer.classList.remove('visible');
            setTimeout(() => {
                if (document.body.contains(notificationContainer)) {
                    document.body.removeChild(notificationContainer);
                }
            }, 300);
        }
    }, 3000);
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