// ===== FILE: js/state.js =====
// Manages the application's state

// Import dataService functions at the top
import * as dataService from './dataService.js'; // <-- Added import
import { showNotification } from './notificationHelper.js'; // <-- Ensure this is imported if used in saveSettings error

let chatHistory = [];
let currentImage = null; // { data: base64string, name: filename }
let currentUser = null; // Current logged-in user, populated by authService
let settings = { // Default structure
    apiKey: '',
    model: 'gpt-4o',
    ttsInstructions: '',
    ttsVoice: 'alloy', // Load initial default from here
    geminiApiKey: '',
    xaiApiKey: '',
    enableHtmlSandbox: false
};
let attachedFiles = []; // For per-message file uploads
let isImageGenerationMode = false; // Track if image generation mode is active
let lastGeneratedImageUrl = null; // Track the last generated image URL
let isDeepResearchMode = false; // Track if deep research mode is active

let isWebSearchEnabled = false; // Track if search is active for the next send
let previousResponseId = null; // Track the ID of the last successful response (for Responses API)
let activeChatId = null; // Track the ID of the chat loaded from storage

let customGptConfigs = []; // Array to hold loaded config metadata {id, name, description} for dropdowns
let activeCustomGptConfig = null; // Holds the currently selected full config object or null for default behavior

// --- Real-time Session State ---
let isRealtimeSessionActive = false;
let realtimeSessionStatus = 'inactive'; // 'inactive', 'connecting', 'active', 'error'
let realtimeConnection = null; // RTCPeerConnection instance
let realtimeDataChannel = null; // RTCDataChannel instance
let realtimeRemoteAudioStream = null; // MediaStream from AI
let realtimeEphemeralKey = null; // Ephemeral key for the session
let currentRealtimeTranscript = ''; // Live transcript

// --- Getters and Setters for Real-time State ---
export function getIsRealtimeSessionActive() { return isRealtimeSessionActive; }
export function setIsRealtimeSessionActive(value) { isRealtimeSessionActive = value; }

export function getRealtimeSessionStatus() { return realtimeSessionStatus; }
export function setRealtimeSessionStatus(value) { realtimeSessionStatus = value; }

export function getRealtimeConnection() { return realtimeConnection; }
export function setRealtimeConnection(value) { realtimeConnection = value; }

export function getRealtimeDataChannel() { return realtimeDataChannel; }
export function setRealtimeDataChannel(value) { realtimeDataChannel = value; }

export function getRealtimeRemoteAudioStream() { return realtimeRemoteAudioStream; }
export function setRealtimeRemoteAudioStream(value) { realtimeRemoteAudioStream = value; }

export function getRealtimeEphemeralKey() { return realtimeEphemeralKey; }
export function setRealtimeEphemeralKey(value) { realtimeEphemeralKey = value; }

export function getCurrentRealtimeTranscript() { return currentRealtimeTranscript; }
export function setCurrentRealtimeTranscript(value) { currentRealtimeTranscript = value; }


// --- Chat History ---
export function getChatHistory() {
    return [...chatHistory]; // Return a copy
}

/**
 * Adds a message to the chat history.
 * @param {{role: string, content: string, imageData?: string | null, generatedImageUrl?: string | null, attachedFilesMeta?: Array<{name: string, type: string}>}} message - The message object.
 */
export function addMessageToHistory(message) {
    const messageToAdd = {
        ...message,
        imageData: message.imageData || null,
        generatedImageUrl: message.generatedImageUrl || null,
        attachedFilesMeta: message.attachedFilesMeta || null
    };
    chatHistory.push(messageToAdd);
}

export function setActiveChat(history, chatId = null) {
    console.log(`Setting active chat: ${chatId || 'New Chat'}`);
    chatHistory = history ? [...history] : [];
    activeChatId = chatId;
    previousResponseId = null;
    currentImage = null;
    attachedFiles = [];
    isWebSearchEnabled = false;
    // UI updates handled separately
}

export function clearChatHistory() {
    console.log("Clearing active chat session state.");
    setActiveChat([], null);
    clearLastGeneratedImageUrl();
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
export function addAttachedFile(fileMeta) {
    if (!attachedFiles.some(f => f.name === fileMeta.name)) {
        attachedFiles.push({ ...fileMeta, content: null, processing: true, error: null });
        console.log("Added file to state:", fileMeta.name);
    } else { console.warn("Attempted to add duplicate file:", fileMeta.name); }
}
export function updateAttachedFileContent(fileName, content) {
    const file = attachedFiles.find(f => f.name === fileName);
    if (file) { file.content = content; file.processing = false; file.error = null; console.log("Updated content for file:", fileName); }
}
export function setAttachedFileError(fileName, errorMessage) {
    const file = attachedFiles.find(f => f.name === fileName);
    if (file) { file.content = null; file.processing = false; file.error = errorMessage; console.error("Error processing file:", fileName, errorMessage); }
}
export function removeAttachedFile(fileName) {
    attachedFiles = attachedFiles.filter(f => f.name !== fileName); console.log("Removed file from state:", fileName);
}
export function clearAttachedFiles() {
    if (attachedFiles.length > 0) { attachedFiles = []; console.log("Cleared all attached files from state."); }
}

// --- User State ---
export function getCurrentUserState() {
    return currentUser;
}

export function setCurrentUserState(user) {
    currentUser = user;
    console.log("User state updated:", user ? user.email : "logged out");
    // Reload settings when auth state changes to fetch/clear cloud settings
    loadSettings().then(() => {
        console.log("Settings potentially reloaded after auth state change.");
        // Trigger immediate UI updates if necessary, e.g., re-render header/settings form
        // import { updateHeaderModelSelect } from './components/header.js'; // Example
        // updateHeaderModelSelect(settings.model); // Example
    }).catch(error => {
        console.error("Error reloading settings after auth change:", error);
    });
}

// --- General Settings ---

/**
 * Loads settings, prioritizing Supabase for logged-in users, falling back to localStorage.
 * @returns {Promise<object>} A copy of the final settings state.
 */
export async function loadSettings() { // <-- Made async
    console.log("Attempting to load settings...");
    // 1. Load defaults from localStorage as a fallback
    let localApiKey = localStorage.getItem('openai_api_key') || '';
    let localModel = localStorage.getItem('openai_model') || 'gpt-4o';
    let localTtsInstructions = localStorage.getItem('openai_tts_instructions') || '';
    let localTtsVoice = localStorage.getItem('openai_tts_voice') || 'alloy';
    let localGeminiApiKey = localStorage.getItem('google_gemini_api_key') || '';
    let localXaiApiKey = localStorage.getItem('xai_api_key') || '';
    let localEnableHtmlSandbox = localStorage.getItem('enableHtmlSandbox') === 'true';

    // Apply localStorage values initially to the settings object
    settings = {
        apiKey: localApiKey,
        model: localModel,
        ttsInstructions: localTtsInstructions,
        ttsVoice: localTtsVoice,
        geminiApiKey: localGeminiApiKey,
        xaiApiKey: localXaiApiKey,
        enableHtmlSandbox: localEnableHtmlSandbox
    };
    console.log("Initial settings from localStorage:", { ...settings });


    // 2. If user is logged in, try to load from Supabase
    if (currentUser) { // <-- Check the currentUser state variable
        console.log(`User ${currentUser.email} (ID: ${currentUser.id}) logged in. Fetching settings from Supabase...`);
        try {
            // Fetch both settings and API keys concurrently
            console.log("Starting API key fetch from Supabase...");
            const apiKeysPromise = dataService.getApiKeys();
            console.log("Starting settings fetch from Supabase...");
            const settingsPromise = dataService.getSettings();

            // Wait for both promises to resolve
            const [dbSettings, dbApiKeys] = await Promise.all([
                settingsPromise,
                apiKeysPromise
            ]);

            console.log("Fetched DB Settings:", dbSettings);
            console.log("Fetched DB API Keys:", dbApiKeys);

            // Debug: Check if API keys are in the expected format
            if (dbApiKeys) {
                console.log(`API Keys array length: ${dbApiKeys.length}`);
                if (dbApiKeys.length > 0) {
                    console.log("First API key structure:", JSON.stringify(dbApiKeys[0]));
                } else {
                    console.warn("No API keys found in database for this user");
                }
            } else {
                console.error("API keys response is null or undefined");
            }

            // 3. Merge Supabase data into the settings object, overwriting localStorage values
            if (dbSettings && Object.keys(dbSettings).length > 0) {
                console.log("Merging DB settings into app state...");
                // Use DB value if it exists, otherwise keep the value loaded from localStorage/default
                settings.model = dbSettings.default_model || settings.model;
                settings.ttsInstructions = dbSettings.tts_instructions !== null ? dbSettings.tts_instructions : settings.ttsInstructions; // Handle null from DB
                settings.ttsVoice = dbSettings.tts_voice || settings.ttsVoice;
                settings.enableHtmlSandbox = dbSettings.enable_html_sandbox !== undefined ? dbSettings.enable_html_sandbox : settings.enableHtmlSandbox;
            }

            if (dbApiKeys && dbApiKeys.length > 0) {
                console.log("Merging API keys into app state...");
                dbApiKeys.forEach(key => {
                    // Use the key from DB ONLY if it's not empty/null
                    if (key.encrypted_key) {
                        console.log(`Processing API key for provider: ${key.provider}`);
                        if (key.provider === 'openai') {
                            settings.apiKey = key.encrypted_key;
                            console.log("Set OpenAI API key from database");
                        } else if (key.provider === 'gemini') {
                            settings.geminiApiKey = key.encrypted_key;
                            console.log("Set Gemini API key from database");
                        } else if (key.provider === 'xai') {
                            settings.xaiApiKey = key.encrypted_key;
                            console.log("Set XAI API key from database");
                        } else {
                            console.warn(`Unknown provider: ${key.provider}`);
                        }
                    } else {
                        console.warn(`Empty encrypted_key for provider: ${key.provider}`);
                    }
                });
            } else {
                console.warn("No API keys found or empty array returned");
            }
            console.log("Settings after merging Supabase data:", {
                apiKey: settings.apiKey ? "API key present" : "No API key",
                model: settings.model,
                geminiApiKey: settings.geminiApiKey ? "Gemini API key present" : "No Gemini API key",
                xaiApiKey: settings.xaiApiKey ? "XAI API key present" : "No XAI API key",
                // Other settings...
            });

        } catch (error) {
            console.error("Failed to load settings/keys from Supabase, using localStorage fallback:", error);
            console.error("Error details:", error.stack || "No stack trace available");
            // Fallback to localStorage values already set if Supabase fetch fails
        }
    } else {
        console.log("No user logged in, using settings loaded from localStorage.");
    }

    // Return a copy of the final settings state
    return { ...settings };
}


export async function saveSettings(newApiKey, newModel, newTtsInstructions, newGeminiApiKey, newXaiApiKey, newTtsVoice, newEnableHtmlSandbox) {
    // Update the internal state object
    settings.apiKey = newApiKey;
    settings.model = newModel;
    settings.ttsInstructions = newTtsInstructions?.trim() ?? '';
    settings.ttsVoice = newTtsVoice || 'alloy';
    settings.geminiApiKey = newGeminiApiKey?.trim() ?? '';
    settings.xaiApiKey = newXaiApiKey?.trim() ?? '';
    settings.enableHtmlSandbox = newEnableHtmlSandbox === undefined ? false : newEnableHtmlSandbox;

    // Always save to localStorage as fallback
    localStorage.setItem('openai_api_key', settings.apiKey);
    localStorage.setItem('openai_model', settings.model);
    localStorage.setItem('openai_tts_instructions', settings.ttsInstructions);
    localStorage.setItem('openai_tts_voice', settings.ttsVoice);
    localStorage.setItem('google_gemini_api_key', settings.geminiApiKey);
    localStorage.setItem('xai_api_key', settings.xaiApiKey);
    localStorage.setItem('enableHtmlSandbox', settings.enableHtmlSandbox.toString());

    // If user is logged in, save to Supabase too
    if (currentUser) {
        console.log("User logged in. Saving settings to Supabase...");
        try {
            // dataService functions handle upserting
            await dataService.saveApiKey('openai', settings.apiKey);
            await dataService.saveApiKey('gemini', settings.geminiApiKey);
            await dataService.saveApiKey('xai', settings.xaiApiKey);

            await dataService.saveSettings({
                model: settings.model,
                ttsInstructions: settings.ttsInstructions,
                ttsVoice: settings.ttsVoice,
                enableHtmlSandbox: settings.enableHtmlSandbox
            });

            console.log("Settings successfully saved to Supabase.");
        } catch (error) {
            console.error("Error saving settings to Supabase:", error);
            // Notify user about sync failure, data is still saved locally
            showNotification(`Failed to sync settings to cloud: ${error.message}`, 'error');
        }
    } else {
        console.log("No user logged in. Settings saved only to localStorage.");
    }

    console.log("General Settings Saved (State & LocalStorage):", { ...settings });
}


// --- Getters for settings ---
export function getApiKey() { return settings.apiKey; }
export function getSelectedModelSetting() { return settings.model; }
export function getTtsInstructions() { return settings.ttsInstructions; }
export function getGeminiApiKey() { return settings.geminiApiKey; }
export function getXaiApiKey() { return settings.xaiApiKey; }
export function getTtsVoice() { return settings.ttsVoice; }
export function getIsHtmlSandboxEnabled() { return settings.enableHtmlSandbox; }

// --- Web Search State (Per-message Toggle) ---
export function toggleWebSearch() {
    isWebSearchEnabled = !isWebSearchEnabled;
    console.log("Web Search Toggled:", isWebSearchEnabled);
    return isWebSearchEnabled;
}
export function getIsWebSearchEnabled() { return isWebSearchEnabled; }
export function setIsWebSearchEnabled(value) { isWebSearchEnabled = value; console.log("Web Search Set To:", isWebSearchEnabled); }

// --- Responses API Conversation State ---
export function setPreviousResponseId(id) {
    console.log("Setting Previous Response ID:", id);
    previousResponseId = id;
}
export function getPreviousResponseId() { return previousResponseId; }

// --- Custom GPT Config State ---
export function getCustomGptConfigs() {
    return [...customGptConfigs];
}
export function setCustomGptConfigs(configs) {
    customGptConfigs = configs || [];
    console.log("Custom GPT configs list updated:", customGptConfigs.length);
}
export function setActiveCustomGptConfig(config) {
    activeCustomGptConfig = config ? { ...config } : null;
    console.log("Active Custom GPT Config set to:", activeCustomGptConfig?.name || 'Default');
    setPreviousResponseId(null); // Reset conversation context
}
export function getActiveCustomGptConfig() {
    return activeCustomGptConfig;
}
export function clearActiveCustomGptConfig() {
    if (activeCustomGptConfig) {
        console.log("Clearing active Custom GPT config.");
        setActiveCustomGptConfig(null);
    }
}

// --- Image Generation Mode State ---
export function setImageGenerationMode(isActive) {
    isImageGenerationMode = isActive;
    console.log("Image Generation Mode:", isImageGenerationMode);
}
export function getIsImageGenerationMode() {
    return isImageGenerationMode;
}

// --- Last Generated Image URL State ---
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

// --- Deep Research Mode State ---
export function getIsDeepResearchMode() {
    return isDeepResearchMode;
}
export function setIsDeepResearchMode(isActive) {
    isDeepResearchMode = !!isActive; // Ensure boolean
    console.log("Deep Research Mode set to:", isDeepResearchMode);
    if (isDeepResearchMode) {
        setIsWebSearchEnabled(false);
        setImageGenerationMode(false);
    }
}
