// ===== FILE: js/components/chatInput.js =====
import * as state from '../state.js';
import * as api from '../api.js';
import * as utils from '../utils.js'; // utils now contains processAndStoreFile
import { addUserMessage, showChatInterface } from './messageList.js';
import { showNotification } from './notification.js';

// --- DOM Elements ---
const messageInputElement = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
// Image Elements
const imagePreviewContainer = document.getElementById('imagePreview');
const imageInputElement = document.getElementById('imageInput');
const imageButton = document.getElementById('imageButton');
// File Elements
const filePreviewContainer = document.getElementById('filePreview');
const fileInputElement = document.getElementById('fileInput');
const addButton = document.getElementById('addButton'); // Existing "+" button

// Toolbar buttons
const searchButton = document.getElementById('searchButton');
const researchButton = document.getElementById('researchButton');
const voiceButton = document.getElementById('voiceButton');
const imageGenButton = document.getElementById('imageGenButton');

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
        const item = document.createElement('div');
        item.className = 'file-preview-item';
        item.dataset.fileName = file.name;
        let statusHtml = '';
        if (file.processing) {
            statusHtml = `<span class="file-status">Processing...</span>`;
        } else if (file.error) {
            statusHtml = `<span class="file-error" title="${utils.escapeHTML(file.error)}">Error</span>`;
        }
        item.innerHTML = `
            <span class="file-name">${utils.escapeHTML(file.name)}</span>
            ${statusHtml}
            <button class="remove-file" title="Remove file">×</button>
        `;
        const removeBtn = item.querySelector('.remove-file');
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
    const item = event.target.closest('.file-preview-item');
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
    // --- (Keep existing variable declarations and validation) ---
    const messageText = getMessageInput();
    const imageToSend = state.getCurrentImage();
    const files = state.getAttachedFiles();
    const selectedModelSetting = state.getSelectedModelSetting();
    let useWebSearch = state.getIsWebSearchEnabled();
    const isImageGenMode = state.getIsImageGenerationMode();
    // ... (rest of validation) ...
    if (isImageGenMode) { /* ... */ }
    else if (!messageText && !imageToSend && files.length === 0) { /* ... */ return; }
    const apiKey = state.getApiKey();
    if (!apiKey) { /* ... */ return; }
    const processingFiles = files.filter(f => f.processing);
    if (processingFiles.length > 0) { /* ... */ return; }

    // --- Show Chat Interface ---
    showChatInterface();

    // --- Add User Message to UI & History ---
    addUserMessage(messageText, imageToSend?.data);
    state.addMessageToHistory({
        role: 'user',
        content: messageText,
        imageData: imageToSend?.data || null
    });

    // --- Clear Input & Previews ---
    clearMessageInput();
    if (imageToSend) {
        removeImagePreview();
        state.clearCurrentImage(); // Make sure state is cleared too
    }
    if (files.length > 0) {
        state.clearAttachedFiles();
        renderFilePreviews();
    }

    // --- >>> Close mobile options popup if open <<< ---
    if (bottomToolbarElement?.classList.contains('mobile-visible')) {
        console.log("Closing mobile options popup due to sending message.");
        bottomToolbarElement.classList.remove('mobile-visible');
        // Reset '+' icon state
        if (mobileOptionsToggleBtn) { // Check if button exists
            mobileOptionsToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`; // Plus icon (+)
            mobileOptionsToggleBtn.title = "More options";
        }
    }

    // --- Call API ---
    console.log("Calling api.routeApiCall...");
    await api.routeApiCall(selectedModelSetting, useWebSearch);

    // --- Reset UI State ---
    // ... (keep existing reset code for imageGen, search) ...
    if (isImageGenMode) { /* ... */ }
    else if (useWebSearch && effectiveModel === 'gpt-4o') { /* ... */ } // Use effectiveModel if needed
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
    const effectiveModel = activeGpt?.model || state.getSelectedModelSetting(); // Use GPT's model if specified, else default
    const isGemini = effectiveModel.startsWith('gemini-');
    const isGpt4o = effectiveModel === 'gpt-4o';
    const isO3Mini = effectiveModel === 'o3-mini-high';

    console.log(`Updating input UI for effective model: ${effectiveModel} (Is Gemini: ${isGemini}, Is GPT-4o: ${isGpt4o})`);

    // Web Search UI - Only available for GPT-4o
    if (searchButton) {
        searchButton.disabled = !isGpt4o; // Only enable for GPT-4o
        searchButton.title = isGpt4o ? "Toggle Web Search" : "Web Search only available for GPT-4o";
        if (!isGpt4o) {
            searchButton.classList.remove('active');
            state.setIsWebSearchEnabled(false);
        }
    }

    // Image Generation UI - Currently only OpenAI DALL-E is implemented
    if (imageGenButton) {
        const supportsDalleGen = isGpt4o; // Currently only OpenAI DALL-E is implemented
        imageGenButton.disabled = !supportsDalleGen;
        imageGenButton.title = supportsDalleGen ? "Toggle Image Generation Mode (DALL-E 3)" : "Image Generation currently requires GPT-4o (DALL-E 3)";
        if (!supportsDalleGen) {
            imageGenButton.classList.remove('active');
            state.setImageGenerationMode(false);
            if (messageInputElement) {
                const modelName = isGemini ? "Gemini" : "ChatGPT";
                messageInputElement.placeholder = `Message ${modelName}`;
            }
        } else {
            // Update placeholder based on state if GPT-4o is active
            if (messageInputElement) {
                messageInputElement.placeholder = state.getIsImageGenerationMode() ? "Enter a prompt to generate an image..." : "Message ChatGPT";
            }
        }
    }

    // Image Upload Button - Both Gemini and GPT-4o support image input
    if (imageButton) {
        const supportsImageInput = isGemini || isGpt4o;
        imageButton.disabled = !supportsImageInput;
        imageButton.title = supportsImageInput ? "Upload image" : "Image upload requires GPT-4o or Gemini";
        if (!supportsImageInput && state.getCurrentImage()) {
            showNotification("Image removed as it's not supported by this model.", 'warning');
            state.clearCurrentImage();
            removeImagePreview();
        }
    }

    // Update File Add Button (Keep enabled, rely on API limits/validation for now)
    if (addButton) {
        const files = state.getAttachedFiles();
        addButton.disabled = files.length >= MAX_FILES;
        addButton.title = addButton.disabled ? `Maximum ${MAX_FILES} files reached` : `Add File (.txt, .md, .pdf)`;
    }
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


// --- Initialization ---

export function initializeChatInput() {
    console.log("Initializing Chat Input...");

    // --- >>> Get Mobile Elements <<< ---
    mobileOptionsToggleBtn = document.getElementById('mobileOptionsToggleBtn');
    bottomToolbarElement = document.querySelector('.input-container .bottom-toolbar');
    console.log("Selected Mobile Elements:", { mobileOptionsToggleBtn, bottomToolbarElement }); // Debug Log

    // Text Input & Send Button
    if (messageInputElement) {
        messageInputElement.addEventListener('input', adjustTextAreaHeight);
        messageInputElement.addEventListener('keydown', handleMessageInputKeydown);
    } else { console.error("Message input element ('messageInput') not found."); }
    if (sendButton) {
        sendButton.addEventListener('click', handleSendMessage);
    } else { console.error("Send button ('sendButton') not found."); }

    // Image Upload
    if (imageButton) {
        imageButton.addEventListener('click', () => { imageInputElement?.click(); });
    } else { console.error("Image button ('imageButton') not found."); }
    if (imageInputElement) {
        imageInputElement.addEventListener('change', handleImageUpload);
    } else { console.error("Image input element ('imageInput') not found."); }

    // File Upload
    if (addButton) {
        addButton.addEventListener('click', triggerFileInput);
    } else { console.error("Add file button ('addButton') not found."); }
    if (fileInputElement) {
        fileInputElement.addEventListener('change', handleFileSelection);
    } else { console.error("File input element ('fileInput') not found."); }


    // --- >>> Mobile Toggle Button Listener <<< ---
    if (mobileOptionsToggleBtn) {
        mobileOptionsToggleBtn.addEventListener('click', (event) => {
            console.log("EVENT: Mobile options toggle BUTTON CLICKED!"); // Debug Log
            event.stopPropagation(); // Prevent click from immediately closing via document listener
            toggleMobileOptions(); // Call the toggle function
        });
        console.log("Listener attached to #mobileOptionsToggleBtn."); // Debug Log
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
            handleNotImplemented(e);
            closeMobileOptions();
        }); 
    }
    if (voiceButton) { 
        voiceButton.addEventListener('click', (e) => {
            handleNotImplemented(e);
            closeMobileOptions();
        }); 
    }
    if (imageGenButton) { 
        imageGenButton.addEventListener('click', (e) => {
            handleImageGenToggle(e);
            closeMobileOptions();
        }); 
    }
    if (fileInputElement) {
        fileInputElement.addEventListener('click', (e) => {
            // Your existing file input handling
            closeMobileOptions();
        });
    }

    // Make sure all toolbar buttons close the popup when clicked
    document.querySelectorAll('.bottom-toolbar .tool-button').forEach(button => {
        button.addEventListener('click', () => {
            closeMobileOptions();
        });
    });
    
    // Also handle specific button click events as needed
    if (imageButton) {
        imageButton.addEventListener('click', () => {
            // Existing image upload handling logic
            imageInputElement.click();
            closeMobileOptions();
        });
    }
    
    if (fileInputElement) {
        fileInputElement.addEventListener('click', () => {
            // Existing file upload handling logic  
            fileInputElement.click();
            closeMobileOptions();
        });
    }
    
    // Handle other specific toolbar buttons similarly
    // ... existing code ...

    // Initial UI state updates
    adjustTextAreaHeight();
    updateInputUIForModel(state.getActiveCustomGptConfig()); // Pass active config initially
    renderFilePreviews(); // Render initial (empty) file previews
    console.log("Chat Input Initialized.");
}