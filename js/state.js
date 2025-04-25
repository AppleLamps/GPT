// ===== FILE: js/state.js =====
/**
 * Application state management with optimized memory usage and performance
 * Uses immutable patterns for state access and memoization for performance
 */
import * as dataService from './dataService.js';
import { showNotification } from './notificationHelper.js';

// Main state object organized by domains for better organization
const state = {
    chat: {
        history: [],
        activeChatId: null,
        previousResponseId: null,
        isWebSearchEnabled: false,
        isImageGenerationMode: false,
        isDeepResearchMode: false,
        lastGeneratedImageUrl: null
    },
    message: {
        currentImage: null,
        attachedFiles: []
    },
    user: {
        currentUser: null
    },
    settings: {
        apiKey: '',
        model: 'gpt-4o',
        ttsInstructions: '',
        ttsVoice: 'alloy',
        geminiApiKey: '',
        xaiApiKey: '',
        enableHtmlSandbox: false
    },
    customGpt: {
        configs: [],
        activeConfig: null
    }
};

// Cache for memoized values to improve performance
const cache = {
    lastHistoryCopy: null,
    lastHistoryHash: '',
    settingsLoaded: false
};

// --- Helper functions ---

/**
 * Simple hashing function for history state to detect changes
 * @param {Array} history - The chat history array
 * @returns {string} A hash representing the chat history state
 */
function hashHistory(history) {
    return history.length + '-' + 
           (history.length > 0 ? 
            history[history.length-1].role + 
            history[history.length-1].content?.substring(0, 20) : '');
}

// --- Chat History Management ---

/**
 * Get a copy of the current chat history
 * Uses memoization to avoid creating new objects when history hasn't changed
 * @returns {Array} A copy of the chat history array
 */
export function getChatHistory() {
    const currentHash = hashHistory(state.chat.history);
    
    if (currentHash !== cache.lastHistoryHash || !cache.lastHistoryCopy) {
        cache.lastHistoryCopy = [...state.chat.history]; 
        cache.lastHistoryHash = currentHash;
    }
    
    return cache.lastHistoryCopy;
}

/**
 * Adds a message to the chat history
 * @param {Object} message - The message object to add
 */
export function addMessageToHistory(message) {
    if (!message) return;
    
    const messageToAdd = {
        ...message,
        imageData: message.imageData || null,
        attachedFilesMeta: message.attachedFilesMeta || null
    };
    
    state.chat.history.push(messageToAdd);
    
    // Invalidate cache
    cache.lastHistoryHash = '';
    cache.lastHistoryCopy = null;
}

/**
 * Sets the active chat and resets related state
 * @param {Array} history - The chat history to set
 * @param {string|null} chatId - The ID of the chat
 */
export function setActiveChat(history, chatId = null) {
    console.log(`Setting active chat: ${chatId || 'New Chat'}`);
    
    // Reset all related state at once
    state.chat.history = history ? [...history] : [];
    state.chat.activeChatId = chatId;
    state.chat.previousResponseId = null;
    state.message.currentImage = null;
    state.message.attachedFiles = [];
    state.chat.isWebSearchEnabled = false;
    
    // Invalidate cache
    cache.lastHistoryHash = '';
    cache.lastHistoryCopy = null;
}

/**
 * Clears the current chat session
 */
export function clearChatHistory() {
    console.log("Clearing active chat session state.");
    setActiveChat([], null);
    clearLastGeneratedImageUrl();
}

/**
 * Removes the last assistant message from history
 */
export function removeLastAssistantMessageFromHistory() {
    if (state.chat.history.length > 0 && 
        state.chat.history[state.chat.history.length - 1].role === "assistant") {
        
        state.chat.history.pop();
        
        // Invalidate cache
        cache.lastHistoryHash = '';
        cache.lastHistoryCopy = null;
        
        console.log("Removed last assistant message from history.");
    }
}

/**
 * Gets the ID of the active chat
 * @returns {string|null} The active chat ID
 */
export function getActiveChatId() {
    return state.chat.activeChatId;
}

// --- Image and File Attachments ---

export function getCurrentImage() { 
    return state.message.currentImage; 
}

export function setCurrentImage(imageData) { 
    state.message.currentImage = imageData; 
}

export function clearCurrentImage() { 
    state.message.currentImage = null; 
}

export function getAttachedFiles() { 
    return [...state.message.attachedFiles]; 
}

export function addAttachedFile(fileMeta) {
    if (!fileMeta || !fileMeta.name) return;
    
    if (!state.message.attachedFiles.some(f => f.name === fileMeta.name)) {
        state.message.attachedFiles.push({ 
            ...fileMeta, 
            content: null, 
            processing: true, 
            error: null 
        });
        console.log("Added file to state:", fileMeta.name);
    } else {
        console.warn("Attempted to add duplicate file:", fileMeta.name);
    }
}

export function updateAttachedFileContent(fileName, content) {
    if (!fileName) return;
    
    const file = state.message.attachedFiles.find(f => f.name === fileName);
    if (file) { 
        file.content = content; 
        file.processing = false; 
        file.error = null;
    }
}

export function setAttachedFileError(fileName, errorMessage) {
    if (!fileName) return;
    
    const file = state.message.attachedFiles.find(f => f.name === fileName);
    if (file) { 
        file.content = null;
        file.processing = false;
        file.error = errorMessage;
        console.error("Error processing file:", fileName, errorMessage);
    }
}

export function removeAttachedFile(fileName) {
    if (!fileName) return;
    
    const initialLength = state.message.attachedFiles.length;
    state.message.attachedFiles = state.message.attachedFiles.filter(f => f.name !== fileName);
    
    if (state.message.attachedFiles.length < initialLength) {
        console.log("Removed file from state:", fileName);
    }
}

export function clearAttachedFiles() {
    if (state.message.attachedFiles.length > 0) {
        state.message.attachedFiles = [];
        console.log("Cleared all attached files from state.");
    }
}

// --- User Authentication State ---

export function getCurrentUserState() {
    return state.user.currentUser;
}

export function setCurrentUserState(user) {
    const wasLoggedIn = !!state.user.currentUser;
    const isLoggingIn = !!user;
    state.user.currentUser = user;
    
    console.log("User state updated:", user ? user.email : "logged out");
    
    // Only reload settings if auth state actually changed
    if (wasLoggedIn !== isLoggingIn) {
        // Reset cache to force reload
        cache.settingsLoaded = false;
        
        loadSettings().then(() => {
            console.log("Settings reloaded after auth state change.");
        }).catch(error => {
            console.error("Error reloading settings after auth change:", error);
        });
    }
}

// --- Settings Management ---

/**
 * Loads settings from localStorage and Supabase (if logged in)
 * @returns {Promise<Object>} A copy of the settings
 */
export async function loadSettings() {
    // If settings already loaded and no auth change, return cached
    if (cache.settingsLoaded) {
        return { ...state.settings };
    }
    
    console.log("Loading settings...");
    
    // Load from localStorage first
    state.settings.apiKey = localStorage.getItem('openai_api_key') || '';
    state.settings.model = localStorage.getItem('openai_model') || 'gpt-4o';
    state.settings.ttsInstructions = localStorage.getItem('openai_tts_instructions') || '';
    state.settings.ttsVoice = localStorage.getItem('openai_tts_voice') || 'alloy';
    state.settings.geminiApiKey = localStorage.getItem('google_gemini_api_key') || '';
    state.settings.xaiApiKey = localStorage.getItem('xai_api_key') || '';
    state.settings.enableHtmlSandbox = localStorage.getItem('enableHtmlSandbox') === 'true';

    // If user is logged in, override with Supabase data
    if (state.user.currentUser) {
        try {
            // Fetch both settings and API keys concurrently
            const [dbSettings, dbApiKeys] = await Promise.all([
                dataService.getSettings(),
                dataService.getApiKeys()
            ]);

            // Apply DB settings if available
            if (dbSettings && Object.keys(dbSettings).length > 0) {
                if (dbSettings.default_model) state.settings.model = dbSettings.default_model;
                if (dbSettings.tts_instructions !== null) state.settings.ttsInstructions = dbSettings.tts_instructions;
                if (dbSettings.tts_voice) state.settings.ttsVoice = dbSettings.tts_voice;
                if (dbSettings.enable_html_sandbox !== undefined) state.settings.enableHtmlSandbox = dbSettings.enable_html_sandbox;
            }

            // Apply API keys if available
            if (dbApiKeys && dbApiKeys.length > 0) {
                for (const key of dbApiKeys) {
                    if (!key.encrypted_key) continue;
                    
                    switch(key.provider) {
                        case 'openai': state.settings.apiKey = key.encrypted_key; break;
                        case 'gemini': state.settings.geminiApiKey = key.encrypted_key; break;
                        case 'xai': state.settings.xaiApiKey = key.encrypted_key; break;
                    }
                }
            }
        } catch (error) {
            console.error("Failed to load settings from Supabase:", error);
            // Continue with localStorage values
        }
    }
    
    cache.settingsLoaded = true;
    return { ...state.settings };
}

/**
 * Saves settings to localStorage and Supabase (if logged in)
 */
export async function saveSettings(newApiKey, newModel, newTtsInstructions, newGeminiApiKey, newXaiApiKey, newTtsVoice, newEnableHtmlSandbox) {
    // Update state
    state.settings.apiKey = newApiKey || '';
    state.settings.model = newModel || 'gpt-4o';
    state.settings.ttsInstructions = newTtsInstructions?.trim() || '';
    state.settings.ttsVoice = newTtsVoice || 'alloy';
    state.settings.geminiApiKey = newGeminiApiKey?.trim() || '';
    state.settings.xaiApiKey = newXaiApiKey?.trim() || '';
    state.settings.enableHtmlSandbox = !!newEnableHtmlSandbox;

    // Save to localStorage
    localStorage.setItem('openai_api_key', state.settings.apiKey);
    localStorage.setItem('openai_model', state.settings.model);
    localStorage.setItem('openai_tts_instructions', state.settings.ttsInstructions);
    localStorage.setItem('openai_tts_voice', state.settings.ttsVoice);
    localStorage.setItem('google_gemini_api_key', state.settings.geminiApiKey);
    localStorage.setItem('xai_api_key', state.settings.xaiApiKey);
    localStorage.setItem('enableHtmlSandbox', state.settings.enableHtmlSandbox.toString());

    // Save to Supabase if logged in
    if (state.user.currentUser) {
        try {
            // Run saves in parallel for better performance
            await Promise.all([
                dataService.saveApiKey('openai', state.settings.apiKey),
                dataService.saveApiKey('gemini', state.settings.geminiApiKey),
                dataService.saveApiKey('xai', state.settings.xaiApiKey),
                dataService.saveSettings({
                    model: state.settings.model,
                    ttsInstructions: state.settings.ttsInstructions,
                    ttsVoice: state.settings.ttsVoice,
                    enableHtmlSandbox: state.settings.enableHtmlSandbox
                })
            ]);
            
            console.log("Settings successfully saved to Supabase.");
        } catch (error) {
            console.error("Error saving settings to Supabase:", error);
            showNotification(`Failed to sync settings to cloud: ${error.message}`, 'error');
        }
    }
}

// --- Settings Getters ---
export function getApiKey() { return state.settings.apiKey; }
export function getSelectedModelSetting() { return state.settings.model; }
export function getTtsInstructions() { return state.settings.ttsInstructions; }
export function getGeminiApiKey() { return state.settings.geminiApiKey; }
export function getXaiApiKey() { return state.settings.xaiApiKey; }
export function getTtsVoice() { return state.settings.ttsVoice; }
export function getIsHtmlSandboxEnabled() { return state.settings.enableHtmlSandbox; }

// --- Web Search State ---
export function toggleWebSearch() {
    state.chat.isWebSearchEnabled = !state.chat.isWebSearchEnabled;
    console.log("Web Search Toggled:", state.chat.isWebSearchEnabled);
    return state.chat.isWebSearchEnabled;
}

export function getIsWebSearchEnabled() { 
    return state.chat.isWebSearchEnabled; 
}

export function setIsWebSearchEnabled(value) { 
    state.chat.isWebSearchEnabled = !!value;
}

// --- Response Continuity ---
export function setPreviousResponseId(id) {
    state.chat.previousResponseId = id;
}

export function getPreviousResponseId() { 
    return state.chat.previousResponseId; 
}

// --- Custom GPT Management ---
export function getCustomGptConfigs() {
    return [...state.customGpt.configs];
}

export function setCustomGptConfigs(configs) {
    state.customGpt.configs = configs || [];
}

export function setActiveCustomGptConfig(config) {
    state.customGpt.activeConfig = config ? { ...config } : null;
    setPreviousResponseId(null); // Reset conversation context when changing GPTs
}

export function getActiveCustomGptConfig() {
    return state.customGpt.activeConfig;
}

export function clearActiveCustomGptConfig() {
    if (state.customGpt.activeConfig) {
        setActiveCustomGptConfig(null);
    }
}

// --- Special Modes ---

export function setImageGenerationMode(isActive) {
    state.chat.isImageGenerationMode = !!isActive;
    
    // Disable incompatible modes
    if (state.chat.isImageGenerationMode) {
        state.chat.isDeepResearchMode = false;
    }
}

export function getIsImageGenerationMode() {
    return state.chat.isImageGenerationMode;
}

export function setLastGeneratedImageUrl(url) {
    state.chat.lastGeneratedImageUrl = url;
}

export function getLastGeneratedImageUrl() {
    return state.chat.lastGeneratedImageUrl;
}

export function clearLastGeneratedImageUrl() {
    state.chat.lastGeneratedImageUrl = null;
}

export function getIsDeepResearchMode() {
    return state.chat.isDeepResearchMode;
}

export function setIsDeepResearchMode(isActive) {
    state.chat.isDeepResearchMode = !!isActive;
    
    // Disable incompatible modes
    if (state.chat.isDeepResearchMode) {
        state.chat.isWebSearchEnabled = false;
        state.chat.isImageGenerationMode = false;
    }
}