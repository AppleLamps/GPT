// ===== FILE: js/state.js =====
// Manages the application's state

let chatHistory = [];
let currentImage = null; // { data: base64string, name: filename }
let settings = {
    apiKey: '',
    model: 'gpt-4o', // Default model setting
    ttsInstructions: '', // <<< NEW: Add property for TTS instructions
    geminiApiKey: '', // <<< NEW: Add property for Google Gemini API key
    xaiApiKey: '' // <<< NEW: Add property for X.AI API key
};
let attachedFiles = []; // For per-message file uploads
let isImageGenerationMode = false; // Track if image generation mode is active
let lastGeneratedImageUrl = null; // <<< ADD THIS LINE: Track the last generated image URL
let isDeepResearchMode = false; // Track if deep research mode is active

let isWebSearchEnabled = false; // Track if search is active for the next send
let previousResponseId = null; // Track the ID of the last successful response (for Responses API)
let activeChatId = null; // Track the ID of the chat loaded from storage

// <<< NEW: Custom GPT State >>>
let customGptConfigs = []; // Array to hold loaded config metadata {id, name, description} for dropdowns
let activeCustomGptConfig = null; // Holds the currently selected full config object or null for default behavior

// --- Chat History ---
export function getChatHistory() {
    return [...chatHistory]; // Return a copy
}

/**
 * Adds a message to the chat history.
 * @param {{role: string, content: string, imageData?: string | null, attachedFilesMeta?: Array<{name: string, type: string}>}} message - The message object.
 * imageData is optional and contains the base64 string of the image if present.
 * attachedFilesMeta is optional and contains metadata about files attached to this message.
 */
export function addMessageToHistory(message) {
    // Ensure imageData and attachedFilesMeta are either their expected type or explicitly null/undefined
    const messageToAdd = { 
        ...message, 
        imageData: message.imageData || null,
        attachedFilesMeta: message.attachedFilesMeta || null 
    };
    chatHistory.push(messageToAdd);
    // console.log("Added to history:", messageToAdd); // Optional: Debug log
}

export function setActiveChat(history, chatId = null) {
    console.log(`Setting active chat: ${chatId || 'New Chat'}`);
    chatHistory = history ? [...history] : [];
    activeChatId = chatId;
    previousResponseId = null; // Reset conversation context when loading a chat
    currentImage = null; // Clear any staged image
    attachedFiles = []; // Clear per-message attached files
    isWebSearchEnabled = false; // Reset search toggle
    // Note: UI updates handled separately
}

export function clearChatHistory() {
    console.log("Clearing active chat session state.");
    setActiveChat([], null);
    clearLastGeneratedImageUrl();
    // Decide if clearing chat should also clear the active Custom GPT config.
    // For now, let's keep the active config unless explicitly changed.
    // clearActiveCustomGptConfig(); // Uncomment if needed
}

export function removeLastAssistantMessageFromHistory() {
    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "assistant") {
        chatHistory.pop();
        console.log("Removed last assistant message from history.");
    }
}

export function getActiveChatId() {
    return activeChatId;
}

// --- Current Image (Per-message) ---
export function getCurrentImage() { return currentImage; }
export function setCurrentImage(imageData) { currentImage = imageData; }
export function clearCurrentImage() { currentImage = null; }

// --- Attached Files (Per-message) ---
export function getAttachedFiles() { return [...attachedFiles]; }
export function addAttachedFile(fileMeta) { /* ... (implementation from previous code) ... */
    if (!attachedFiles.some(f => f.name === fileMeta.name)) {
        attachedFiles.push({ ...fileMeta, content: null, processing: true, error: null });
        console.log("Added file to state:", fileMeta.name);
    } else { console.warn("Attempted to add duplicate file:", fileMeta.name); }
}
export function updateAttachedFileContent(fileName, content) { /* ... (implementation from previous code) ... */
    const file = attachedFiles.find(f => f.name === fileName);
    if (file) { file.content = content; file.processing = false; file.error = null; console.log("Updated content for file:", fileName); }
}
export function setAttachedFileError(fileName, errorMessage) { /* ... (implementation from previous code) ... */
    const file = attachedFiles.find(f => f.name === fileName);
    if (file) { file.content = null; file.processing = false; file.error = errorMessage; console.error("Error processing file:", fileName, errorMessage); }
}
export function removeAttachedFile(fileName) { /* ... (implementation from previous code) ... */
    attachedFiles = attachedFiles.filter(f => f.name !== fileName); console.log("Removed file from state:", fileName);
}
export function clearAttachedFiles() { /* ... (implementation from previous code) ... */
    if (attachedFiles.length > 0) { attachedFiles = []; console.log("Cleared all attached files from state."); }
}

// --- General Settings ---
export function loadSettings() {
    settings.apiKey = localStorage.getItem('openai_api_key') || '';
    settings.model = localStorage.getItem('openai_model') || 'gpt-4o';
    settings.ttsInstructions = localStorage.getItem('openai_tts_instructions') || '';
    settings.geminiApiKey = localStorage.getItem('google_gemini_api_key') || '';
    settings.xaiApiKey = localStorage.getItem('xai_api_key') || '';
    console.log("General Settings Loaded:", settings);
    return { ...settings }; // Return a copy
}

// <<< MODIFIED: Accept geminiApiKey as a fourth argument >>>
export function saveSettings(newApiKey, newModel, newTtsInstructions, newGeminiApiKey, newXaiApiKey) { // <<< MODIFIED: Added newXaiApiKey parameter
    settings.apiKey = newApiKey;
    settings.model = newModel;
    // Handle potential null/undefined, default to empty string
    settings.ttsInstructions = newTtsInstructions?.trim() ?? ''; // <<< Save instructions
    settings.geminiApiKey = newGeminiApiKey?.trim() ?? ''; // <<< NEW: Save Gemini API key
    settings.xaiApiKey = newXaiApiKey?.trim() ?? ''; // <<< NEW: Save X.AI API key

    localStorage.setItem('openai_api_key', newApiKey);
    localStorage.setItem('openai_model', newModel);
    localStorage.setItem('openai_tts_instructions', settings.ttsInstructions); // <<< Save to localStorage
    localStorage.setItem('google_gemini_api_key', settings.geminiApiKey); // <<< NEW: Save to localStorage
    localStorage.setItem('xai_api_key', newXaiApiKey?.trim() ?? ''); // Fixed: Use newXaiApiKey instead of settings.xaiApiKey

    console.log("General Settings Saved:", settings);

    // If switching the *default* model away from gpt-4o, maybe reset context?
    // This logic might need refinement depending on interaction with Custom GPTs
    if (newModel !== 'gpt-4o') {
        // isWebSearchEnabled = false; // Search toggle state is separate
        // previousResponseId = null; // Conversation state tied to actual API calls, not default setting
    }
    // UI update for input buttons depends on the *effective* model (default or custom)
    // This should be called after saveSettings completes.
}

export function getApiKey() { return settings.apiKey; }
export function getSelectedModelSetting() { return settings.model; }
export function getTtsInstructions() { return settings.ttsInstructions; }
export function getGeminiApiKey() { return settings.geminiApiKey; }
export function getXaiApiKey() { return settings.xaiApiKey; } // NEW: Getter function for X.AI API key

// --- Web Search State (Per-message Toggle) ---
export function toggleWebSearch() {
    // Web search depends on the *effective* model used (gpt-4o)
    // We allow toggling, but api.js will check compatibility before sending
    isWebSearchEnabled = !isWebSearchEnabled;
    console.log("Web Search Toggled:", isWebSearchEnabled);
    return isWebSearchEnabled;
}
export function getIsWebSearchEnabled() { return isWebSearchEnabled; } // Raw toggle state
export function setIsWebSearchEnabled(value) { isWebSearchEnabled = value; console.log("Web Search Set To:", isWebSearchEnabled); }

// --- Responses API Conversation State ---
export function setPreviousResponseId(id) {
    // This is tied to the actual gpt-4o conversation flow
    console.log("Setting Previous Response ID:", id);
    previousResponseId = id;
}
export function getPreviousResponseId() { return previousResponseId; }

// --- Custom GPT Config State --- <<< NEW / CORRECTED SECTION >>>

/**
 * Gets the list of loaded Custom GPT configuration metadata.
 * @returns {Array<{id: string, name: string, description?: string}>}
 */
export function getCustomGptConfigs() {
    return [...customGptConfigs];
}

/**
 * Sets the list of available Custom GPT configurations (typically loaded from storage).
 * @param {Array<{id: string, name: string, description?: string}>} configs - The list of config metadata.
 */
export function setCustomGptConfigs(configs) {
    customGptConfigs = configs || [];
    console.log("Custom GPT configs list updated:", customGptConfigs.length);
}

/**
 * Sets the currently active Custom GPT configuration.
 * @param {object | null} config - The full configuration object loaded from storage, or null to use default behavior.
 */
export function setActiveCustomGptConfig(config) {
    activeCustomGptConfig = config ? { ...config } : null; // Store a copy or null
    console.log("Active Custom GPT Config set to:", activeCustomGptConfig?.name || 'Default');

    // Reset conversation context when switching configs
    setPreviousResponseId(null);

    // Optional: Decide if switching GPTs should always start a new chat history
    // if (getChatHistory().length > 0) { // Only clear if there's an existing chat
    //    console.log("Clearing chat history due to Custom GPT change.");
    //    clearChatHistory(); // This will trigger UI updates via setActiveChat
    // }

    // Trigger necessary UI updates (e.g., header display, input button states)
    // These are often handled by the calling function (e.g., in configManagerUI or header)
}

/**
 * Gets the currently active Custom GPT configuration object.
 * @returns {object | null} The full configuration object or null if none is active.
 */
export function getActiveCustomGptConfig() {
    return activeCustomGptConfig;
}

/**
 * Clears the active Custom GPT configuration, reverting to default behavior.
 */
export function clearActiveCustomGptConfig() {
    if (activeCustomGptConfig) {
        console.log("Clearing active Custom GPT config.");
        setActiveCustomGptConfig(null);
    }
}
// --- End Custom GPT Config State ---

// --- Image Generation Mode State ---
export function setImageGenerationMode(isActive) {
    isImageGenerationMode = isActive;
    console.log("Image Generation Mode:", isImageGenerationMode);
    // The URL will now persist after exiting image generation mode
    // It will only be cleared after being used in buildResponsesApiInput
}

export function getIsImageGenerationMode() {
    return isImageGenerationMode;
}

// --- Last Generated Image URL State --- <<< ADD THIS SECTION
export function setLastGeneratedImageUrl(url) {
    lastGeneratedImageUrl = url;
    console.log("Stored Last Generated Image URL:", lastGeneratedImageUrl ? "URL present" : "null");
}

export function getLastGeneratedImageUrl() {
    return lastGeneratedImageUrl;
}

export function clearLastGeneratedImageUrl() {
    if (lastGeneratedImageUrl) {
        console.log("Clearing Last Generated Image URL.");
        lastGeneratedImageUrl = null;
    }
}
// --- End Last Generated Image URL State ---

// --- Deep Research Mode State ---
export function getIsDeepResearchMode() {
    return isDeepResearchMode;
}

export function setIsDeepResearchMode(isActive) {
    isDeepResearchMode = !!isActive; // Ensure boolean
    console.log("Deep Research Mode set to:", isDeepResearchMode);
    // If turning ON deep research, turn OFF other modes
    if (isDeepResearchMode) {
        setIsWebSearchEnabled(false);
        setImageGenerationMode(false);
        // Add any other conflicting modes here
    }
}
