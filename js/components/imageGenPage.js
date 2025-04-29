// ===== FILE: js/components/imageGenPage.js =====

// --- DOM Elements ---
let imageGenPromptInput;
let imageGenSendButton;
let imageGenImageButton;
let imageGenVoiceButton;
let imageGenLiveButton;
let imageGenImageInput;
let imageGenImagePreview;
let imageDisplayArea;
let editingImageDataUrl = null;

// --- Functions ---

import { callImageGenerationFunction } from '../api.js'; // Adjust path
import { showNotification } from '../notificationHelper.js'; // Adjust path
import { escapeHTML } from '../utils.js'; // Adjust path

// Keep references to DOM elements (imageGenPromptInput, etc.)
// Assuming these are defined elsewhere or will be defined in initializeImageGenPage

async function handleGenerateClick() {
    const prompt = imageGenPromptInput?.value.trim();
    if (!prompt && !editingImageDataUrl) {
        showNotification("Please enter a prompt or upload an image.", "warning");
        return;
    }
    const modelToUse = "gemini-2.0-flash-exp-image-generation";
    imageDisplayArea.innerHTML = '<p>Generating with Gemini...</p>';
    imageGenSendButton.disabled = true;
    try {
        const result = await callImageGenerationFunction(prompt, modelToUse, editingImageDataUrl ? [editingImageDataUrl] : null);
        imageDisplayArea.innerHTML = '';
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${result.b64_json}`;
        img.alt = "Gemini Generated Image";
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        imageDisplayArea.appendChild(img);
    } catch (error) {
        console.error("Gemini image generation failed:", error);
        imageDisplayArea.innerHTML = `<p style="color: red;">Error: ${escapeHTML(error.message)}</p>`;
        showNotification(`Gemini image generation failed: ${error.message}`, 'error');
    } finally {
        imageGenSendButton.disabled = false;
    }
}

// --- Initialization ---
export function initializeImageGenPage() {
    console.log("Initializing Image Generation Page...");
    imageGenPromptInput = document.getElementById('imageGenPromptInput');
    imageGenSendButton = document.getElementById('imageGenSendButton');
    imageGenImageButton = document.getElementById('imageGenImageButton');
    imageGenVoiceButton = document.getElementById('imageGenVoiceButton');
    imageGenLiveButton = document.getElementById('imageGenLiveButton');
    imageGenImageInput = document.getElementById('imageGenImageInput');
    imageGenImagePreview = document.getElementById('imageGenImagePreview');
    imageDisplayArea = document.getElementById('imageDisplayArea');
    // Send button handler
    if (imageGenSendButton) {
        imageGenSendButton.addEventListener('click', handleGenerateClick);
    }
    // Image upload button handler
    if (imageGenImageButton && imageGenImageInput) {
        imageGenImageButton.addEventListener('click', (e) => {
            e.preventDefault();
            imageGenImageInput.click();
        });
        imageGenImageInput.addEventListener('change', handleImageUpload);
    }
    // Voice button handler
    if (imageGenVoiceButton) {
        imageGenVoiceButton.addEventListener('click', (e) => {
            e.preventDefault();
            startVoiceRecognition();
        });
    }
    // Live call button handler
    if (imageGenLiveButton) {
        imageGenLiveButton.addEventListener('click', (e) => {
            e.preventDefault();
            startLiveCall();
        });
    }
    // Textarea auto-grow
    if (imageGenPromptInput) {
        imageGenPromptInput.addEventListener('input', adjustTextAreaHeight);
    }
    console.log("Image Generation Page Initialized.");
}

// --- Helpers ---
// --- Helpers ---
function handleImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        // Store the ENTIRE Data URL string for sending to the backend
        editingImageDataUrl = e.target.result;
        // Pass ONLY the base64 part to render the preview, as renderImagePreview adds the prefix back
        renderImagePreview(editingImageDataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
}

function renderImagePreview(base64Image) {
    if (!imageGenImagePreview) return;
    imageGenImagePreview.innerHTML = '';
    // renderImagePreview expects just the base64 part and adds the prefix
    if (base64Image) {
        const img = document.createElement('img');
        // Add the prefix back for browser display
        img.src = `data:image/${getFileExtensionFromBase64(base64Image)};base64,${base64Image}`; // More robust type handling
        img.alt = 'Preview';
        img.style.maxWidth = '120px';
        img.style.maxHeight = '120px';
        img.style.margin = '8px 0';
        imageGenImagePreview.appendChild(img);

        // Add remove button
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'remove-image-btn';
        removeBtn.onclick = () => {
            editingImageDataUrl = null; // Clear the stored full URL
            renderImagePreview(null); // Clear the preview
            if (imageGenImageInput) imageGenImageInput.value = ''; // Clear file input value
        };
        imageGenImagePreview.appendChild(removeBtn);
    }
}

// Helper to guess file extension for preview based on base64 header (simple guess)
// In a real app, you might store/pass the mime type from the original upload
function getFileExtensionFromBase64(base64) {
    if (base64.startsWith('/9j/')) return 'jpeg'; // JPEG
    if (base64.startsWith('iVBORw0KGgo')) return 'png'; // PNG
    if (base64.startsWith('R0lGODdh')) return 'gif'; // GIF
    if (base64.startsWith('UklGR')) return 'webp'; // WebP
    return 'png'; // Default or fallback
}

// Keep the rest of your code as is...

function adjustTextAreaHeight() {
    if (!imageGenPromptInput) return;
    imageGenPromptInput.style.height = 'auto';
    imageGenPromptInput.style.height = (imageGenPromptInput.scrollHeight) + 'px';
}

// --- Stubs for voice/live ---
function startVoiceRecognition() {
    showNotification('Voice recognition not implemented yet for image generation.', 'info');
}
function startLiveCall() {
    showNotification('Live call not implemented yet for image generation.', 'info');
}
