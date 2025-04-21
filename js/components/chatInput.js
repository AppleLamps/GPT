// ===== FILE: js/components/chatInput.js =====
import * as state from '../state.js';
import * as api from '../api.js';
import * as utils from '../utils.js'; // utils now contains processAndStoreFile and getFileExtension
import { addUserMessage, showChatInterface, showTypingIndicator, removeTypingIndicator, createAIMessageContainer, finalizeAIMessageContent, setupMessageActions } from './messageList.js';
import { showNotification } from '../notificationHelper.js';
import { fetchDeepResearch } from '../geminiapi.js'; // Will be created
import { parseMarkdownString } from '../parser.js'; // Will be created

// --- Voice Recognition Function ---
function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        showNotification("Voice recognition not supported in this browser.", "error");
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        showNotification("Listening... Speak now.", "info");
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        showNotification(`Voice error: ${event.error}`, "error");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Voice input:", transcript);
        setMessageInputValue(transcript); // Set input field with transcribed text
    };

    recognition.onend = () => {
        console.log("Voice recognition ended.");
    };

    recognition.start();
}

// --- DOM Elements ---
const messageInputElement = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
// Image Elements
// Don't initialize these at the top level - move to initializeChatInput
let imagePreviewContainer = null;
let imageInputElement = null;
let imageButton = null;
// File Elements
let filePreviewContainer = null;
let fileInputElement = null;
let addButton = null; 

// Toolbar buttons
let searchButton = null;
let researchButton = null;
let voiceButton = null;
let imageGenButton = null;

// --- >>> Mobile Elements <<< ---
// Get elements within the initialization function to ensure DOM is ready
let mobileOptionsToggleBtn = null;
let bottomToolbarElement = null;

// --- Constants ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit (adjust as needed)
const ALLOWED_FILE_TYPES = ['text/plain', 'text/markdown', 'application/pdf'];
const MAX_FILES = 5; // Limit number of files

// --- File Handling Logic ---
// ... (Existing functions: triggerFileInput, handleFileSelection, renderFilePreviews, handleRemoveFileClick) ...
// --- (Keep these functions exactly as they were) ---
function triggerFileInput() {
    console.log("triggerFileInput called."); // Debug log
    if (fileInputElement) {
        const currentFiles = state.getAttachedFiles();
        console.log(`Current attached files: ${currentFiles.length}`); // Debug log
        if (currentFiles.length >= MAX_FILES) {
            showNotification(`You can attach a maximum of ${MAX_FILES} files.`, 'warning');
            return;
        }
        fileInputElement.click();
    } else {
        console.error("File input element ('fileInput') not found.");
    }
}
async function handleFileSelection(event) {
    console.log("handleFileSelection triggered."); // Debug log
    const files = event.target.files;
    if (!files || files.length === 0) {
        console.log("No files selected."); // Debug log
        return; // No files selected
    }
    const currentFiles = state.getAttachedFiles();
    let filesAddedCount = 0;
    console.log(`Processing ${files.length} selected file(s). Currently have ${currentFiles.length}. Max ${MAX_FILES}.`); // Debug log
    for (const file of files) {
        console.log(`Checking file: ${file.name}, Size: ${file.size}, Type: ${file.type}`); // Debug log
        if (currentFiles.length + filesAddedCount >= MAX_FILES) {
            showNotification(`Maximum ${MAX_FILES} files allowed. Some files were not added.`, 'warning');
            console.log("Max files reached, stopping file processing loop."); // Debug log
            break; // Stop adding more files
        }
        const fileTypeAllowed = ALLOWED_FILE_TYPES.includes(file.type) ||
            (file.type === '' && file.name.endsWith('.md')); // Allow empty type for .md
        if (!fileTypeAllowed) {
            console.warn(`Skipping file: ${file.name} - Type not supported: ${file.type}`); // Debug log
            showNotification(`File type not supported for "${file.name}". Allowed: TXT, MD, PDF.`, 'error');
            continue; // Skip this file
        }
        if (file.size > MAX_FILE_SIZE) {
            console.warn(`Skipping file: ${file.name} - Exceeds size limit.`); // Debug log
            showNotification(`File "${file.name}" exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB size limit.`, 'error');
            continue; // Skip this file
        }
        if (currentFiles.some(f => f.name === file.name)) {
            console.warn(`Skipping file: ${file.name} - Already attached.`); // Debug log
            showNotification(`File "${file.name}" is already attached.`, 'warning');
            continue; // Skip duplicate
        }
        console.log(`Adding file to state: ${file.name}`); // Debug log
        state.addAttachedFile({
            name: file.name,
            type: file.type,
            size: file.size
        });
        filesAddedCount++;
        renderFilePreviews(); // Update UI immediately
        console.log(`Starting background processing for: ${file.name}`); // Debug log
        utils.processAndStoreFile(file); // Don't await, let it run
    }
    if (fileInputElement) {
        fileInputElement.value = '';
    }
    console.log("Finished processing selected files batch."); // Debug log
}
export function renderFilePreviews() {
    console.log("renderFilePreviews called."); // Debug log
    if (!filePreviewContainer) {
        console.error("File preview container ('filePreview') not found.");
        return;
    }
    const files = state.getAttachedFiles();
    filePreviewContainer.innerHTML = ''; // Clear existing previews
    console.log(`Rendering ${files.length} file previews.`); // Debug log
    
    files.forEach(file => {
        const extension = utils.getFileExtension(file.name);
        let iconClass = 'unknown'; // Default icon class

        // Map extensions to CSS classes
        if (extension === 'txt') {
            iconClass = 'txt';
        } else if (extension === 'pdf') {
            iconClass = 'pdf';
        } else if (extension === 'md') {
            iconClass = 'md';
        }

        const item = document.createElement('div');
        item.className = 'attached-file-pill';
        item.dataset.fileName = file.name;

        let statusHtml = '';
        if (file.processing) {
            statusHtml = `<span class="file-status" style="margin-left: 5px; font-style: italic; font-size: 0.9em; color: var(--text-muted);">Processing...</span>`;
        } else if (file.error) {
            statusHtml = `<span class="file-error" title="${utils.escapeHTML(file.error)}" style="margin-left: 5px; font-weight: bold; color: var(--error-color);">Error</span>`;
        }

        item.innerHTML = `
            <span class="file-icon ${iconClass}"></span>
            <span class="filename-text">${utils.escapeHTML(file.name)}</span>
            ${statusHtml}
            <button class="remove-file-button" title="Remove file">×</button>
        `;

        const removeBtn = item.querySelector('.remove-file-button');
        if (removeBtn) {
            removeBtn.addEventListener('click', handleRemoveFileClick);
        } else {
            console.warn(`Could not find remove button for file item: ${file.name}`);
        }
        filePreviewContainer.appendChild(item);
    });

    if (addButton) {
        addButton.classList.toggle('has-files', files.length > 0);
        addButton.disabled = files.length >= MAX_FILES;
        if (addButton.disabled) {
            addButton.title = `Maximum ${MAX_FILES} files reached`;
        } else {
            addButton.title = `Add File (.txt, .md, .pdf)`;
        }
    }
}
function handleRemoveFileClick(event) {
    console.log("handleRemoveFileClick triggered."); // Debug log
    const item = event.target.closest('.attached-file-pill'); // Updated selector
    const fileName = item?.dataset.fileName;
    if (fileName) {
        console.log(`Removing file: ${fileName}`); // Debug log
        state.removeAttachedFile(fileName); // Remove from state
        renderFilePreviews(); // Re-render the previews
    } else {
        console.warn("Could not determine file name to remove.");
    }
}


// --- Chat Input Logic ---
// ... (Existing functions: adjustTextAreaHeight, clearMessageInput, getMessageInput, setMessageInputValue) ...
// --- (Keep these functions exactly as they were) ---
function adjustTextAreaHeight() {
    if (!messageInputElement) return;
    messageInputElement.style.height = 'auto';
    const scrollHeight = messageInputElement.scrollHeight;
    const maxHeight = 200; // Defined in CSS as max-height
    messageInputElement.style.height = (scrollHeight < maxHeight ? scrollHeight : maxHeight) + 'px';
    messageInputElement.style.overflowY = scrollHeight < maxHeight ? 'hidden' : 'auto';
}
export function clearMessageInput() {
    if (!messageInputElement) return;
    messageInputElement.value = '';
    adjustTextAreaHeight();
}
function getMessageInput() {
    return messageInputElement?.value.trim() || '';
}
export function setMessageInputValue(text) {
    if (!messageInputElement) return;
    messageInputElement.value = text;
    adjustTextAreaHeight();
    messageInputElement.focus();
}

// --- >>> Mobile Options Toggle Logic <<< ---

/**
 * Toggles the visibility of the mobile options toolbar.
 */
function toggleMobileOptions() {
    // >>> Debug Log <<<
    console.log("FUNC: toggleMobileOptions called!");
    if (!bottomToolbarElement || !mobileOptionsToggleBtn) {
        console.error("ERROR: Missing mobile toolbar or toggle button in toggleMobileOptions!", { bottomToolbarElement, mobileOptionsToggleBtn });
        return;
    }

    bottomToolbarElement.classList.toggle('mobile-visible');
    const isVisible = bottomToolbarElement.classList.contains('mobile-visible');
    // >>> Debug Log <<<
    console.log("Toolbar 'mobile-visible' class toggled. Is visible now?", isVisible);

    // Update icon and title
    mobileOptionsToggleBtn.innerHTML = isVisible
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` // Close icon (X)
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`; // Plus icon (+)
    mobileOptionsToggleBtn.title = isVisible ? "Close options" : "More options";
}

/**
 * Closes the mobile options toolbar if a click occurs outside it.
 * @param {Event} event
 */
function handleOutsideClickForMobileOptions(event) {
    // Only run if the toolbar and toggle button exist
    if (!bottomToolbarElement || !mobileOptionsToggleBtn) return;

    if (!bottomToolbarElement.classList.contains('mobile-visible')) {
        return; // Popup isn't open
    }

    // Check if the click was outside the toggle button AND outside the toolbar itself
    const clickedOutside = !mobileOptionsToggleBtn.contains(event.target) && !bottomToolbarElement.contains(event.target);

    if (clickedOutside) {
        console.log("Clicked outside mobile options, closing.");
        bottomToolbarElement.classList.remove('mobile-visible');
        // Reset '+' icon state
        mobileOptionsToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`; // Plus icon (+)
        mobileOptionsToggleBtn.title = "More options";
    }
}

/**
 * Closes the mobile options toolbar.
 */
function closeMobileOptions() {
    if (!bottomToolbarElement || !mobileOptionsToggleBtn) return;
    
    if (bottomToolbarElement.classList.contains('mobile-visible')) {
        bottomToolbarElement.classList.remove('mobile-visible');
        // Reset '+' icon state
        mobileOptionsToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`; // Plus icon (+)
        mobileOptionsToggleBtn.title = "More options";
    }
}


// --- Modified handleSendMessage ---
async function handleSendMessage() {
    console.log("FUNC: handleSendMessage triggered!");

    // --- ADD DEEP RESEARCH MODE CHECK ---
    const isDeepResearchModeActive = state.getIsDeepResearchMode();

    if (isDeepResearchModeActive) {
        console.log("Deep Research mode is ACTIVE. Triggering research...");
        const userTopic = getMessageInput();
        if (!userTopic) {
            showNotification("Please enter a topic for deep research.", 'warning');
            return;
        }

        const geminiApiKey = state.getGeminiApiKey();
        // Redundant check, but safe
        if (!geminiApiKey) {
            showNotification("Gemini API key not set.", 'error');
            // Turn off mode if key missing somehow
            state.setIsDeepResearchMode(false);
            researchButton?.classList.remove('active');
            updateInputUIForModel(state.getActiveCustomGptConfig());
            return;
        }

        // Add user's topic message to UI and history
        showChatInterface();
        addUserMessage(userTopic); // Display user message
        state.addMessageToHistory({ role: 'user', content: userTopic });

        // Clear input AFTER getting topic
        clearMessageInput();

        // Get model name (should be the specific one for deep research)
        const modelName = "gemini-2.5-pro-exp-03-25"; // Hardcoded for deep research

        // Execute the deep research (logic moved to a separate function in Step 4)
        await executeDeepResearch(geminiApiKey, modelName, userTopic);

        // IMPORTANT: Turn off deep research mode AFTER execution
        state.setIsDeepResearchMode(false);
        researchButton?.classList.remove('active');
        updateInputUIForModel(state.getActiveCustomGptConfig()); // Update UI back to normal

        return; // Stop execution here for deep research

    } else {
        console.log("Deep Research mode is INACTIVE. Proceeding with normal chat/image gen...");
        const messageText = getMessageInput();
        const imageToSend = state.getCurrentImage();
        const files = state.getAttachedFiles();
        const selectedModelSetting = state.getSelectedModelSetting();
        let useWebSearch = state.getIsWebSearchEnabled();
        const isImageGenMode = state.getIsImageGenerationMode();
        const activeGpt = state.getActiveCustomGptConfig();
        const effectiveModel = activeGpt ? 'gpt-4o' : selectedModelSetting;

        // Validation for normal chat
        if (isImageGenMode) {
            if (!messageText) {
                showNotification("Please enter a prompt for image generation.", 'warning');
                return;
            }
        } else if (!messageText && !imageToSend && files.length === 0) {
            showNotification("Please enter a message or upload an image/file.", 'info');
            return;
        }

        const apiKey = state.getApiKey();
        const geminiApiKey = state.getGeminiApiKey();

        if (effectiveModel.startsWith('gemini-') && !geminiApiKey) {
            showNotification("Gemini API key not set in Settings.", 'error');
            return;
        } else if (!effectiveModel.startsWith('gemini-') && !apiKey) {
            showNotification("OpenAI API key not set in Settings.", 'error');
            return;
        }

        const processingFiles = files.filter(f => f.processing);
        if (processingFiles.length > 0) {
            showNotification("Please wait for files to finish processing.", 'warning');
            return;
        }

        // Show Chat Interface
        showChatInterface();

        // Prepare file contents for the message
        let fullMessage = messageText;
        if (files.length > 0) {
            const fileContents = files.map(file => file.content).filter(Boolean);
            if (fileContents.length > 0) {
                // Add file contents before the user's message
                fullMessage = fileContents.join('\n\n') + '\n\n' + (messageText || 'Please analyze the provided content.');
            }
        }

        // Get current files before clearing them
        const attachedFiles = state.getAttachedFiles();
        const attachedFilesMeta = attachedFiles.map(file => ({
            name: file.name,
            type: file.type
        }));

        // Create the user message object
        const userMessage = {
            role: 'user',
            content: fullMessage,
            imageData: imageToSend?.data,
            attachedFilesMeta: attachedFilesMeta.length > 0 ? attachedFilesMeta : null
        };

        // Add message to history and UI
        state.addMessageToHistory(userMessage);
        addUserMessage(messageText, imageToSend?.data, attachedFilesMeta);

        // Clear Input & Previews
        clearMessageInput();
        if (imageToSend) {
            removeImagePreview();
            state.clearCurrentImage();
        }
        if (files.length > 0) {
            state.clearAttachedFiles();
            renderFilePreviews();
        }

        // Close mobile options
        if (bottomToolbarElement?.classList.contains('mobile-visible')) {
            bottomToolbarElement.classList.remove('mobile-visible');
            if (mobileOptionsToggleBtn) {
                mobileOptionsToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
                mobileOptionsToggleBtn.title = "More options";
            }
        }

        // Call API
        console.log("Calling api.routeApiCall for normal chat...");
        await api.routeApiCall(selectedModelSetting, useWebSearch);

        // Reset UI State
        if (isImageGenMode && imageGenButton) {
            imageGenButton.classList.remove('active');
            state.setImageGenerationMode(false);
        } else if (useWebSearch && effectiveModel === 'gpt-4o' && searchButton) {
            searchButton.classList.remove('active');
            state.setIsWebSearchEnabled(false);
        }
        // Update UI based on the effective model after send
        updateInputUIForModel(state.getActiveCustomGptConfig());
    }
}


// --- (Keep handleMessageInputKeydown) ---
function handleMessageInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent newline
        handleSendMessage();
    }
}

// --- Image Handling ---
// ... (Existing functions: handleImageUpload, handleRemoveImageClick, showImagePreview, removeImagePreview) ...
// --- (Keep these functions exactly as they were) ---
async function handleImageUpload(event) {
    console.log("handleImageUpload triggered."); // Debug log
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        console.warn(`Image upload rejected: Invalid type ${file.type}`); // Debug log
        showNotification('Please upload a JPG or PNG image.', 'error');
        state.clearCurrentImage();
        removeImagePreview();
        return;
    }
    try {
        console.log("Converting image to Base64..."); // Debug log
        const base64Image = await utils.convertToBase64(file);
        console.log("Image converted, updating state and preview."); // Debug log
        state.setCurrentImage({ data: base64Image, name: file.name });
        showImagePreview(base64Image); // Show preview in UI
        showNotification('Image ready to send with your next message.', 'success', 2000);
        if (messageInputElement) messageInputElement.focus();
    } catch (error) {
        console.error("Error processing image:", error);
        showNotification('Error processing image.', 'error');
        state.clearCurrentImage();
        removeImagePreview();
    } finally {
        if (imageInputElement) imageInputElement.value = '';
    }
}
function handleRemoveImageClick() {
    console.log("handleRemoveImageClick triggered."); // Debug log
    state.clearCurrentImage();
    removeImagePreview();
}
function showImagePreview(base64Image) {
    if (!imagePreviewContainer) return;
    console.log("Showing image preview."); // Debug log
    imagePreviewContainer.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${base64Image}" alt="Preview">
            <button class="remove-image" id="removeImageBtnInternal" title="Remove image">×</button>
        </div>
    `;
    const removeBtn = document.getElementById('removeImageBtnInternal');
    removeBtn?.addEventListener('click', handleRemoveImageClick);
}
export function removeImagePreview() {
    if (imagePreviewContainer) {
        while (imagePreviewContainer.firstChild) {
            imagePreviewContainer.removeChild(imagePreviewContainer.firstChild);
        }
    }
    if (imageInputElement) {
        imageInputElement.value = '';
    }
}


// --- Toolbar Actions ---
// ... (Existing functions: handleSearchToggle, updateInputUIForModel, handleNotImplemented, handleImageGenToggle) ...
// --- (Keep these functions exactly as they were) ---
function handleSearchToggle() {
    if (!searchButton) return;
    const activeGpt = state.getActiveCustomGptConfig();
    const effectiveModel = activeGpt ? 'gpt-4o' : state.getSelectedModelSetting(); // Determine effective model
    if (effectiveModel === 'gpt-4o') {
        const isActive = state.toggleWebSearch();
        searchButton.classList.toggle('active', isActive);
        showNotification(`Web search for next message: ${isActive ? 'ON' : 'OFF'}`, 'info', 1500);
    } else {
        searchButton.classList.remove('active');
        state.setIsWebSearchEnabled(false); // Ensure state matches UI if model changed
        showNotification("Web search requires GPT-4o.", 'warning');
    }
}
export function updateInputUIForModel(activeGpt) { // Pass activeGpt config object
    const isDeepResearchModeActive = state.getIsDeepResearchMode(); // <<< ADD: Check deep research mode

    // Determine the effective model ONLY if not in deep research mode
    let effectiveModel = 'gemini-2.5-pro-exp-03-25'; // Default to research model if mode is active
    if (!isDeepResearchModeActive) {
        effectiveModel = activeGpt?.model || state.getSelectedModelSetting();
    }

    const isGemini = effectiveModel.startsWith('gemini-');
    const isGpt4o = effectiveModel === 'gpt-4o';
    const isGpt41 = effectiveModel === 'gpt-4.1';
    const isGpt45Preview = effectiveModel === 'gpt-4.5-preview';
    // const isO3Mini = effectiveModel === 'o3-mini-high'; // Keep if needed for other logic

    console.log(`Updating input UI. Deep Research Mode: ${isDeepResearchModeActive}, Effective Model: ${effectiveModel}`);

    // --- UPDATE PLACEHOLDER ---
    if (messageInputElement) {
        if (isDeepResearchModeActive) {
            messageInputElement.placeholder = "Enter topic for Deep Research and press Send...";
        } else if (state.getIsImageGenerationMode() && (isGpt4o || isGpt41 || isGpt45Preview)) {
             messageInputElement.placeholder = "Enter a prompt to generate an image...";
        } else {
            const modelName = isGemini ? "Gemini" : 
                            (isGpt4o ? "ChatGPT" : 
                            (isGpt41 ? "ChatGPT" : 
                            (isGpt45Preview ? "ChatGPT" : "Model")));
            messageInputElement.placeholder = `Message ${modelName}`;
        }
    }

    // --- UPDATE BUTTON STATES ---

    // Web Search UI - Disabled in Deep Research Mode OR if not GPT-4o/GPT-4.1/GPT-4.5
    if (searchButton) {
        const canUseWebSearch = !isDeepResearchModeActive && (isGpt4o || isGpt41 || isGpt45Preview);
        searchButton.disabled = !canUseWebSearch;
        searchButton.title = canUseWebSearch ? "Toggle Web Search" : (isDeepResearchModeActive ? "Web Search disabled in Deep Research mode" : "Web Search only available for GPT-4o/GPT-4.1/GPT-4.5");
        if (!canUseWebSearch) {
            searchButton.classList.remove('active');
            // Ensure state matches UI if mode changed
            if (state.getIsWebSearchEnabled()) { state.setIsWebSearchEnabled(false); }
        } else {
             // Restore active class based on state IF enabled
             searchButton.classList.toggle('active', state.getIsWebSearchEnabled());
        }
    }

    // Image Generation UI - Disabled in Deep Research Mode OR if not GPT-4o/GPT-4.1/GPT-4.5
    if (imageGenButton) {
        const canUseImageGen = !isDeepResearchModeActive && (isGpt4o || isGpt41 || isGpt45Preview);
        imageGenButton.disabled = !canUseImageGen;
        imageGenButton.title = canUseImageGen ? "Toggle Image Generation Mode (DALL-E 3)" : (isDeepResearchModeActive ? "Image Generation disabled in Deep Research mode" : "Image Generation requires GPT-4o, GPT-4.1, or GPT-4.5");
        if (!canUseImageGen) {
            imageGenButton.classList.remove('active');
            // Ensure state matches UI if mode changed
            if (state.getIsImageGenerationMode()) { state.setImageGenerationMode(false); }
        } else {
             // Restore active class based on state IF enabled
             imageGenButton.classList.toggle('active', state.getIsImageGenerationMode());
        }
    }

    // Image Upload Button - Disabled in Deep Research Mode OR if not supported by model
    if (imageButton) {
        const supportsImageInput = !isDeepResearchModeActive && (isGemini || isGpt4o || isGpt41 || isGpt45Preview);
        imageButton.disabled = !supportsImageInput;
        imageButton.title = supportsImageInput ? "Upload image" : (isDeepResearchModeActive ? "Image Upload disabled in Deep Research mode" : "Image upload requires GPT-4o, GPT-4.1, GPT-4.5, or Gemini");
        // Remove preview if mode disables it
        if (!supportsImageInput && state.getCurrentImage()) {
            showNotification("Image removed as it's not supported in this mode.", 'warning');
            state.clearCurrentImage();
            removeImagePreview();
        }
    }

    // File Add Button - Disabled in Deep Research Mode
    if (addButton) {
        const files = state.getAttachedFiles();
        addButton.disabled = isDeepResearchModeActive || files.length >= MAX_FILES; // Disable if DR mode or max files
        addButton.title = isDeepResearchModeActive ? "File Upload disabled in Deep Research mode" : (addButton.disabled ? `Maximum ${MAX_FILES} files reached` : `Add File (.txt, .md, .pdf)`);
         // Remove previews if mode disables it
         if (isDeepResearchModeActive && files.length > 0) {
            showNotification("Files removed as they are not supported in Deep Research mode.", 'warning');
            state.clearAttachedFiles();
            renderFilePreviews();
         }
    }

    // Deep Research Button - Ensure its active state is visually correct
    if (researchButton) {
        // Check if Gemini API key is present, disable if not
        const geminiApiKey = state.getGeminiApiKey();
        researchButton.disabled = !geminiApiKey;
        researchButton.title = geminiApiKey ? "Toggle Deep Research Mode (Gemini)" : "Set Gemini API Key in Settings to enable Deep Research";

        if (!geminiApiKey && isDeepResearchModeActive) {
             // Force mode off if key is missing but somehow mode is on
             state.setIsDeepResearchMode(false);
        }
        // Update active class based purely on state
        researchButton.classList.toggle('active', state.getIsDeepResearchMode() && geminiApiKey);
    }

    // Add similar logic for Voice button if it becomes mode-dependent
}
function handleNotImplemented(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const handledElsewhere = ['sendButton', 'imageButton', 'addButton', 'searchButton', 'imageGenButton', 'mobileOptionsToggleBtn']; // Added mobile btn
    if (handledElsewhere.includes(button.id)) return;
    const buttonText = button.title || button.textContent?.trim().split('\n')[0] || button.id || 'Button';
    showNotification(`${buttonText} functionality not yet implemented.`, 'info');
}
function handleImageGenToggle() {
    const newState = !state.getIsImageGenerationMode();
    state.setImageGenerationMode(newState);
    imageGenButton?.classList.toggle('active', newState);
    showNotification(`Image Generation Mode: ${newState ? 'ON' : 'OFF'}`, 'info', 1500);
    if (messageInputElement) {
        messageInputElement.placeholder = newState ? "Enter a prompt to generate an image..." : "Message ChatGPT";
    }
}


// --- Deep Research Function ---
/**
 * Handles the deep research button click event - NOW ACTS AS A TOGGLE.
 * @param {Event} event - The click event
 */
function handleDeepResearchClick(event) {
  event.preventDefault();

  // Ensure Gemini API key is set before enabling the mode
  const geminiApiKey = state.getGeminiApiKey();
  if (!geminiApiKey) {
    showNotification("Please set your Gemini API key in Settings to use Deep Research.", 'error');
    // Ensure the mode is off if the key isn't set
    if (state.getIsDeepResearchMode()) {
        state.setIsDeepResearchMode(false);
        researchButton?.classList.remove('active'); // Ensure button UI is reset
        updateInputUIForModel(state.getActiveCustomGptConfig()); // Update UI to reflect mode OFF
    }
    return;
  }

  const newState = !state.getIsDeepResearchMode(); // Toggle the state
  state.setIsDeepResearchMode(newState);

  // Update button appearance
  researchButton?.classList.toggle('active', newState);

  // Update input placeholder and other UI elements
  updateInputUIForModel(state.getActiveCustomGptConfig()); // This function needs modification (Step 5)

  // Show notification
  showNotification(`Deep Research Mode: ${newState ? 'ON' : 'OFF'}. Enter topic and press Send.`, 'info', 2500);

  // Focus input
  messageInputElement?.focus();
}

/**
 * Executes the deep research API call and handles displaying the results.
 * @param {string} geminiApiKey
 * @param {string} modelName
 * @param {string} userTopic
 */
async function executeDeepResearch(geminiApiKey, modelName, userTopic) {
    // Construct the detailed prompt using the user topic
    const GENERAL_REPORT_PROMPT = `
Act as an expert researcher and analyst. Your task is to generate a **highly detailed, comprehensive, and well-structured analytical report** based *on the following topic provided by the user*:

**User Topic:** "${userTopic}"

**Overall Goal:** Generate an in-depth report that aims to **significantly exceed 3,000 words**. Focus on depth, rigorous analysis, synthesis of information, exploration of different facets, providing context, and maintaining a clear, coherent structure. Use your internal knowledge base extensively to elaborate on the topic.

**Report Structure (Mandatory JSON Keys):**

Your JSON response MUST contain keys exactly matching the following structure. Populate each key with **extensive, detailed text** as described below:

1.  **Report_Title:** Generate a fitting and descriptive title for this report based on the user's topic.
2.  **Introduction_Scope:** (String: Target 400-600 words) Provide a comprehensive introduction to the user's topic. Define the scope of the report, outline the key areas that will be covered, and state the report's main objectives or the questions it aims to explore. Establish the significance of the topic.
3.  **Historical_Context_Background:** (String: Target 400-700 words) Explore the relevant historical context and background leading up to the current state of the topic. Discuss key developments, foundational concepts, or preceding events necessary to understand the topic fully. If history isn't directly applicable, discuss the foundational principles or context.
4.  **Key_Concepts_Definitions:** (String: Target 400-600 words) Define and explain the core concepts, terminology, and fundamental principles related to the user's topic in detail. Ensure clarity and provide examples where appropriate.
5.  **Main_Analysis_Exploration:** (String: Target 1200-1800+ words) This is the **central and most substantial section**. Break down the user's topic into 3-6 significant sub-themes or key areas of analysis. For **EACH** sub-theme:
    * Clearly introduce the sub-theme.
    * Provide a **deep and detailed exploration** covering relevant aspects, arguments, evidence, examples, case studies, mechanisms, processes, etc.
    * Analyze nuances, complexities, relationships between different elements, and different perspectives related to the sub-theme.
    * Structure this section logically. Use paragraphs effectively. **Substantial elaboration here is critical to meet the overall length goal.**
6.  **Current_State_Applications:** (String: Target 400-600 words) Discuss the current status, relevance, applications, or manifestations of the topic in the real world or relevant fields. Provide specific examples if possible.
7.  **Challenges_Perspectives_Criticisms:** (String: Target 400-600 words) Explore the challenges, limitations, criticisms, controversies, or differing perspectives associated with the topic. Provide a balanced view by discussing potential drawbacks or points of contention.
8.  **Future_Outlook_Trends:** (String: Target 300-500 words) Discuss potential future developments, emerging trends, future research directions, or the long-term outlook related to the topic.
9.  **Conclusion:** (String: Target 300-500 words) Provide a strong concluding section that synthesizes the key points discussed throughout the report. Reiterate the significance of the topic and offer final thoughts or takeaways. Do not introduce new information here.

**Output Instructions:**
- The FINAL output MUST be ONLY the single, valid JSON object described above. No introductory text, explanations, or markdown formatting outside the JSON string values.
- Ensure all string values are properly escaped within the JSON structure. Use newline characters (\`\\n\`) appropriately within the text values for paragraph breaks where needed for readability within the final document, but ensure the overall output is valid JSON.
- For all text sections (2 through 9), provide extensive, well-structured prose. Generate substantial, detailed content for each to collectively exceed the 3,000-word target.
- Leverage your internal knowledge base thoroughly to provide depth and breadth on the **User Topic**.

Generate the JSON output now.
`;
    // --- End of Detailed Report Prompt ---

    showTypingIndicator("Generating deep research report (this may take several minutes)...");

    try {
        // Fetch the research data (expecting JSON object now)
        const reportData = await fetchDeepResearch(geminiApiKey, modelName, GENERAL_REPORT_PROMPT);

        if (reportData && typeof reportData === 'object') {
            // Create message container for the result
            const aiMessageElement = createAIMessageContainer();
            if (aiMessageElement) {
                // Build structured HTML and combined raw text from the JSON data
                let finalHtml = '';
                let combinedRawText = '';

                const sectionMap = {
                    "Report_Title": "Report Title",
                    "Introduction_Scope": "Introduction and Scope",
                    "Historical_Context_Background": "Historical Context and Background",
                    "Key_Concepts_Definitions": "Key Concepts and Definitions",
                    "Main_Analysis_Exploration": "Main Analysis and Exploration",
                    "Current_State_Applications": "Current State and Applications",
                    "Challenges_Perspectives_Criticisms": "Challenges, Perspectives, and Criticisms",
                    "Future_Outlook_Trends": "Future Outlook and Trends",
                    "Conclusion": "Conclusion"
                };

                const reportTitle = reportData['Report_Title'] || 'Deep Research Report';
                finalHtml += `<h2>${utils.escapeHTML(reportTitle)}</h2><br>`;
                combinedRawText += `${reportTitle}\n\n`;

                for (const key in sectionMap) {
                    if (reportData[key] && reportData[key].trim()) {
                        const headingText = sectionMap[key];
                        const sectionRawContent = reportData[key];
                        const sectionHtmlContent = parseMarkdownString(sectionRawContent);

                        finalHtml += `<h3>${utils.escapeHTML(headingText)}</h3>${sectionHtmlContent}<br>`;
                        combinedRawText += `--- ${headingText} ---\n${sectionRawContent}\n\n`;
                    }
                }

                // Display the structured HTML content
                finalizeAIMessageContent(aiMessageElement, finalHtml);

                // Add the *model's response* (combined raw text) to history
                state.addMessageToHistory({ role: "model", content: combinedRawText.trim() });

                // Setup copy/other actions using the combined raw text
                setupMessageActions(aiMessageElement, combinedRawText.trim());

            } else {
                console.error("Failed to create AI message container for deep research result.");
                showNotification("Failed to display deep research result.", "error");
            }
        } else {
            console.log("Deep research fetch returned no content or invalid data.");
            if (!reportData) {
                showNotification("Deep research failed to generate data.", "error");
            }
        }
    } catch (error) {
        // Catch any unexpected errors during the process
        console.error("Error in executeDeepResearch:", error);
        showNotification(`An unexpected error occurred: ${error.message}`, 'error');
    } finally {
        removeTypingIndicator();
    }
}

// --- Initialization ---

export function initializeChatInput() {
    console.log("Initializing Chat Input...");
    
    // Initialize all DOM elements here to ensure they're available when needed
    // Image Elements
    imagePreviewContainer = document.getElementById('imagePreview');
    imageInputElement = document.getElementById('imageInput');
    imageButton = document.getElementById('imageButton');
    
    // File Elements
    filePreviewContainer = document.getElementById('filePreview');
    fileInputElement = document.getElementById('fileInput');
    addButton = document.getElementById('addButton');
    
    // Toolbar buttons
    searchButton = document.getElementById('searchButton');
    researchButton = document.getElementById('researchButton');
    voiceButton = document.getElementById('voiceButton');
    imageGenButton = document.getElementById('imageGenButton');

    // --- >>> Get Mobile Elements <<< ---
    mobileOptionsToggleBtn = document.getElementById('mobileOptionsToggleBtn');
    bottomToolbarElement = document.querySelector('.input-container .bottom-toolbar');
    
    // Debug element availability
    console.log("DOM Elements Status:", { 
        imagePreviewContainer: !!imagePreviewContainer,
        imageInputElement: !!imageInputElement,
        imageButton: !!imageButton,
        filePreviewContainer: !!filePreviewContainer,
        fileInputElement: !!fileInputElement,
        addButton: !!addButton
    });

    // Text Input & Send Button
    if (messageInputElement) {
        messageInputElement.addEventListener('input', adjustTextAreaHeight);
        messageInputElement.addEventListener('keydown', handleMessageInputKeydown);
    } else { console.error("Message input element ('messageInput') not found."); }
    if (sendButton) {
        sendButton.addEventListener('click', handleSendMessage);
    } else { console.error("Send button ('sendButton') not found."); }

    // Image Upload - Add more robust handling
    if (imageButton && imageInputElement) {
        console.log("Setting up image button click handler");
        imageButton.addEventListener('click', (e) => {
            console.log("Image button clicked!");
            e.preventDefault(); // Prevent default action
            e.stopPropagation(); // Stop event bubbling
            if (imageInputElement) {
                console.log("Triggering click on image input");
                imageInputElement.click();
            } else {
                console.error("Image input element not found when button was clicked");
                showNotification("Error accessing image upload. Please refresh the page.", "error");
            }
            closeMobileOptions();
        });
        
        imageInputElement.addEventListener('change', handleImageUpload);
        console.log("Image upload handlers successfully attached");
    } else { 
        console.error(`Image elements missing: button=${!!imageButton}, input=${!!imageInputElement}`); 
    }

    // File Upload
    if (addButton && fileInputElement) {
        addButton.addEventListener('click', triggerFileInput);
        fileInputElement.addEventListener('change', handleFileSelection);
    } else { 
        console.error(`File upload elements missing: button=${!!addButton}, input=${!!fileInputElement}`); 
    }

    // --- >>> Mobile Toggle Button Listener <<< ---
    if (mobileOptionsToggleBtn) {
        mobileOptionsToggleBtn.addEventListener('click', (event) => {
            console.log("EVENT: Mobile options toggle BUTTON CLICKED!"); // Debug Log
            event.stopPropagation(); // Prevent click from immediately closing via document listener
            toggleMobileOptions(); // Call the toggle function
        });
    } else {
        console.warn("WARN: Mobile options toggle button ('#mobileOptionsToggleBtn') not found during init.");
    }

    // --- >>> Listener to close popup on outside click <<< ---
    // Add this listener only once using a flag
    if (!document.hasMobileOutsideClickListener) {
        console.log("Attaching document click listener for closing mobile options."); // Debug Log
        document.addEventListener('click', handleOutsideClickForMobileOptions);
        document.hasMobileOutsideClickListener = true; // Set flag
    }

    // Original Toolbar Buttons (listeners needed for desktop & when popup is visible)
    if (searchButton) { 
        searchButton.addEventListener('click', (e) => {
            handleSearchToggle(e);
            closeMobileOptions();
        }); 
    }
    if (researchButton) { 
        researchButton.addEventListener('click', (e) => {
            handleDeepResearchClick(e);
            closeMobileOptions();
        }); 
    }
    if (voiceButton) { 
        voiceButton.addEventListener('click', (e) => {
            e.preventDefault();
            startVoiceRecognition(); // Actual working handler
            closeMobileOptions();
        }); 
    }
    if (imageGenButton) { 
        imageGenButton.addEventListener('click', (e) => {
            handleImageGenToggle(e);
            closeMobileOptions();
        }); 
    }

    // Make sure all toolbar buttons close the popup when clicked
    document.querySelectorAll('.bottom-toolbar .tool-button').forEach(button => {
        button.addEventListener('click', () => {
            closeMobileOptions();
        });
    });
    
    // Initial UI state updates
    adjustTextAreaHeight();
    updateInputUIForModel(state.getActiveCustomGptConfig());
    renderFilePreviews();
    console.log("Chat Input Initialization Complete");
}
