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

// --- Constants ---
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit (adjust as needed)
const ALLOWED_FILE_TYPES = ['text/plain', 'text/markdown', 'application/pdf'];
const MAX_FILES = 5; // Limit number of files

// --- File Handling Logic ---

/**
 * Triggers the hidden file input click.
 */
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

/**
 * Handles the file selection event from the hidden input.
 * Validates files and initiates processing.
 * @param {Event} event
 */
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

        // --- Validation ---
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
        // --- End Validation ---

        console.log(`Adding file to state: ${file.name}`); // Debug log
        state.addAttachedFile({
            name: file.name,
            type: file.type,
            size: file.size
        });
        filesAddedCount++;

        renderFilePreviews(); // Update UI immediately

        // Start processing (async)
        console.log(`Starting background processing for: ${file.name}`); // Debug log
        utils.processAndStoreFile(file); // Don't await, let it run
    }

    // Clear the input value
    if (fileInputElement) {
        fileInputElement.value = '';
    }
    console.log("Finished processing selected files batch."); // Debug log
}

/**
 * Renders the preview elements for attached files based on current state.
 * Exported because utils.js needs to call it after processing.
 */
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

    // Update the add button style/state if needed
    if (addButton) {
        addButton.classList.toggle('has-files', files.length > 0);
        // Optionally disable if max files reached
        addButton.disabled = files.length >= MAX_FILES;
        if (addButton.disabled) {
            addButton.title = `Maximum ${MAX_FILES} files reached`;
        } else {
            addButton.title = `Add File (.txt, .md, .pdf)`;
        }
    }
}

/**
 * Handles clicking the remove button (×) on a file preview.
 * @param {Event} event
 */
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
// --- End File Handling Logic ---


// --- Chat Input Logic ---

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

async function handleSendMessage() {
    console.log("handleSendMessage triggered!");
    const messageText = getMessageInput(); // User typed text
    const imageToSend = state.getCurrentImage(); // Store the image to check later
    const files = state.getAttachedFiles();
    const selectedModelSetting = state.getSelectedModelSetting();
    let useWebSearch = state.getIsWebSearchEnabled();
    const isImageGenMode = state.getIsImageGenerationMode();
    console.log("Inputs:", { messageText, image: !!imageToSend, files: files.length, model: selectedModelSetting, search: useWebSearch, imageGen: isImageGenMode });

    // --- Validate Input ---
    if (isImageGenMode) {
        if (!messageText) {
            showNotification("Please enter a prompt for image generation.", "warning");
            return;
        }
    } else if (!messageText && !imageToSend && files.length === 0) {
        showNotification("Please enter a message or attach an image/file.", 'info');
        return;
    }

    // --- Check API Key ---
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("API key not set.", "error");
        return;
    }

    // --- Process Files ---
    const processingFiles = files.filter(f => f.processing);
    if (processingFiles.length > 0) {
        showNotification(`Please wait, ${processingFiles.length} file(s) are still processing.`, 'warning');
        return;
    }

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
        state.clearCurrentImage();
    }
    if (files.length > 0) {
        state.clearAttachedFiles();
        renderFilePreviews();
    }

    // --- Call API ---
    console.log("Calling api.routeApiCall...");
    await api.routeApiCall(selectedModelSetting, useWebSearch);

    // --- Reset UI State ---
    if (isImageGenMode) {
        state.setImageGenerationMode(false);
        imageGenButton?.classList.remove('active');
        messageInputElement.placeholder = "Message ChatGPT";
    } else if (useWebSearch && selectedModelSetting === 'gpt-4o') {
        state.setIsWebSearchEnabled(false);
        searchButton?.classList.remove('active');
    }
}


function handleMessageInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent newline
        handleSendMessage();
    }
}

// --- Image Handling ---
async function handleImageUpload(event) {
    console.log("handleImageUpload triggered."); // Debug log
    const file = event.target.files?.[0];
    if (!file) return;

    // Basic type check client-side
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        console.warn(`Image upload rejected: Invalid type ${file.type}`); // Debug log
        showNotification('Please upload a JPG or PNG image.', 'error');
        state.clearCurrentImage();
        removeImagePreview();
        return;
    }

    // Size check (optional, add if needed like file upload)

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
        // Clear file input value
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
    // Attach listener directly here as the button is recreated
    const removeBtn = document.getElementById('removeImageBtnInternal');
    removeBtn?.addEventListener('click', handleRemoveImageClick);
}

export function removeImagePreview() {
    if (imagePreviewContainer) {
        console.log("Removing image preview UI elements..."); // Log start
        // More robust clearing: remove all child nodes
        while (imagePreviewContainer.firstChild) {
            imagePreviewContainer.removeChild(imagePreviewContainer.firstChild);
        }
        console.log("Image preview container cleared."); // Log end
    } else {
        console.warn("Image preview container not found during removal attempt.");
    }
    // Ensure input value is cleared to prevent re-uploading the same file if input isn't clicked again
    if (imageInputElement) {
        imageInputElement.value = '';
        console.log("Image file input value cleared.");
    }
}
// --- End Image Handling ---

// --- Toolbar Actions ---
function handleSearchToggle() {
    if (!searchButton) return;

    // Determine effective model for enabling/disabling search
    const activeGpt = state.getActiveCustomGptConfig();
    const effectiveModel = activeGpt ? 'gpt-4o' : state.getSelectedModelSetting();

    if (effectiveModel === 'gpt-4o') {
        const isActive = state.toggleWebSearch();
        searchButton.classList.toggle('active', isActive);
        console.log("Search toggled:", isActive); // Debug log
        showNotification(`Web search for next message: ${isActive ? 'ON' : 'OFF'}`, 'info', 1500);
    } else {
        console.log("Search toggle ignored: Effective model is not gpt-4o");
        searchButton.classList.remove('active'); // Ensure it's off if model changed
        // Optionally disable the button visually (handled by updateInputUIForModel)
    }
}

/**
 * Updates button states based on the *effective* model (default or custom GPT).
 */
export function updateInputUIForModel(activeGpt) {
    const effectiveModel = state.getActiveCustomGptConfig()?.model || state.getSelectedModelSetting();
    console.log("Updating input UI for model:", effectiveModel);

    // Web Search UI
    const canUseWebSearch = effectiveModel === 'gpt-4o';
    if (searchButton) {
        searchButton.disabled = !canUseWebSearch;
        searchButton.title = canUseWebSearch ? "Toggle Web Search" : "Web Search requires GPT-4o";
        if (!canUseWebSearch) {
            searchButton.classList.remove('active');
            state.setIsWebSearchEnabled(false);
        }
    }

    // Image Generation UI
    const canGenerateImages = effectiveModel === 'gpt-4o'; // Assume DALL-E 3 needs gpt-4o context
    if (imageGenButton) {
        imageGenButton.disabled = !canGenerateImages;
        imageGenButton.title = canGenerateImages ? "Toggle Image Generation Mode" : "Image Generation disabled for this model";
        if (!canGenerateImages) {
            imageGenButton.classList.remove('active');
            state.setImageGenerationMode(false);
            messageInputElement.placeholder = "Message ChatGPT";
        }
    }

    // Update Image Upload Button
    if (imageButton) {
        imageButton.disabled = !canGenerateImages;
        imageButton.title = !canGenerateImages ? "Image upload disabled for this model" : "Upload image";
        if (!canGenerateImages && state.getCurrentImage()) {
            console.log("Effective model changed to non-image, removing existing image.");
            showNotification("Image removed as it's not supported by this model.", 'warning');
            state.clearCurrentImage();
            removeImagePreview();
        }
        console.log(`Image button disabled: ${imageButton.disabled}`);
    }

    // Update File Add Button (Keep enabled, rely on API limits for now)
    if (addButton) {
        // Check current file count against max limit
        const files = state.getAttachedFiles();
        addButton.disabled = files.length >= MAX_FILES;
        if (addButton.disabled) {
            addButton.title = `Maximum ${MAX_FILES} files reached`;
        } else {
            addButton.title = `Add File (.txt, .md, .pdf)`;
        }
        console.log(`Add button disabled: ${addButton.disabled}`);
    }

    const generateImageBtn = document.getElementById('generateImageBtn');
    if (generateImageBtn) {
        generateImageBtn.style.display = activeGpt?.capabilities?.imageGeneration ? 'block' : 'none';
    }
}

function handleNotImplemented(event) {
    const button = event.target.closest('button');
    if (!button) return;
    // List of buttons handled elsewhere or specifically not implemented yet
    const handledElsewhere = ['sendButton', 'imageButton', 'addButton', 'searchButton'];
    if (handledElsewhere.includes(button.id)) return;

    const buttonText = button.title || button.textContent?.trim().split('\n')[0] || button.id || 'Button';
    console.log(`Not implemented button clicked: ${buttonText}`); // Debug log
    showNotification(`${buttonText} functionality not yet implemented.`, 'info');
}

// --- Image Generation Mode Logic ---
function handleImageGenToggle() {
    const newState = !state.getIsImageGenerationMode();
    state.setImageGenerationMode(newState);
    imageGenButton?.classList.toggle('active', newState);
    showNotification(`Image Generation Mode: ${newState ? 'ON' : 'OFF'}`, 'info', 1500);
    // Update placeholder text
    if (messageInputElement) {
        messageInputElement.placeholder = newState ? "Enter a prompt to generate an image..." : "Message ChatGPT";
    }
}

// --- End Toolbar Actions ---


// --- Initialization ---

export function initializeChatInput() {
    console.log("Initializing Chat Input...");

    // Text Input
    if (messageInputElement) {
        messageInputElement.addEventListener('input', adjustTextAreaHeight);
        messageInputElement.addEventListener('keydown', handleMessageInputKeydown);
    } else { console.error("Message input element ('messageInput') not found."); }

    // Send Button
    const sendBtn = document.getElementById('sendButton');
    if (sendBtn) {
        sendBtn.addEventListener('click', handleSendMessage);
    } else { console.error("Send button ('sendButton') not found."); }

    // Image Upload
    if (imageButton) {
        imageButton.addEventListener('click', () => {
            if (imageButton.disabled) return; // Prevent click if disabled
            imageInputElement?.click();
        });
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

    // Toolbar Buttons
    if (searchButton) {
        searchButton.addEventListener('click', handleSearchToggle);
    } else { console.warn("Search button ('searchButton') not found."); }

    if (researchButton) {
        researchButton.addEventListener('click', handleNotImplemented);
    } else { console.warn("Research button ('researchButton') not found."); }

    if (voiceButton) {
        voiceButton.addEventListener('click', handleNotImplemented);
    } else { console.warn("Voice button ('voiceButton') not found."); }

    // Image Generation Mode
    imageGenButton?.addEventListener('click', handleImageGenToggle);

    // Update placeholder on init
    if (messageInputElement) {
        messageInputElement.placeholder = state.getIsImageGenerationMode() ? "Enter a prompt to generate an image..." : "Message ChatGPT";
    }

    // Initial UI state updates
    adjustTextAreaHeight();
    updateInputUIForModel(state.getActiveCustomGptConfig()); // Update based on initial effective model
    renderFilePreviews(); // Render initial (empty) file previews
    console.log("Chat Input Initialized.");
}