// ===== FILE: js/customGpt/gptStore.js =====

// Assuming generateId is in utils.js or create it here/in utils
import { generateId } from '../utils.js';
import { showNotification } from '../notificationHelper.js';

// Constants for localStorage keys
const CONFIG_LIST_KEY = 'gpt_config_list'; // Key for the array of config metadata
const CONFIG_PREFIX = 'gpt_config_';     // Prefix for individual config data keys
const MAX_CONFIG_SIZE_MB = 4.5; // Slightly under 5MB limit for safety
const MAX_CONFIG_SIZE_BYTES = MAX_CONFIG_SIZE_MB * 1024 * 1024;

/**
 * Estimates the size of a configuration object in bytes (simple string length check).
 * @param {object} config
 * @returns {number} Estimated size in bytes.
 */
function estimateConfigSize(config) {
    try {
        return new TextEncoder().encode(JSON.stringify(config)).length;
    } catch (e) {
        console.error("Error estimating config size:", e);
        return Infinity; // Assume too large if estimation fails
    }
}


/**
 * Retrieves the list of Custom GPT config metadata from localStorage.
 * @returns {Array<{id: string, name: string, description?: string}>} An array of config metadata objects.
 */
export function getConfigList() {
    try {
        const listJson = localStorage.getItem(CONFIG_LIST_KEY);
        return listJson ? JSON.parse(listJson) : [];
    } catch (error) {
        console.error("Error getting GPT config list from localStorage:", error);
        return [];
    }
}

/**
 * Saves the current config list metadata array to localStorage.
 * @param {Array<{id: string, name: string, description?: string}>} configList - The array of config metadata.
 * @returns {boolean} True if saving was successful, false otherwise.
 */
function saveConfigList(configList) {
    try {
        localStorage.setItem(CONFIG_LIST_KEY, JSON.stringify(configList));
        return true;
    } catch (error) {
        console.error("Error saving GPT config list to localStorage:", error);
        showNotification("Error saving configuration list.", "error");
        return false;
    }
}

/**
 * Saves a Custom GPT configuration to localStorage.
 * Adds/Updates metadata in the config list.
 * Includes size check before saving.
 * @param {object} config - The configuration object { id?, name, description, instructions, knowledgeFiles: [{name, type, content}], capabilities: {} }.
 * @returns {{id: string, name: string, description?: string} | null} The metadata of the saved/updated config, or null on failure.
 */
export function saveConfig(config) {
    if (!config || !config.name || !config.name.trim()) {
        console.error("Attempted to save an invalid or unnamed config.");
        showNotification("Configuration must have a name.", "error");
        return null;
    }

    const configId = config.id || generateId('cfg'); // Generate ID if it's new
    const configToSave = { ...config, id: configId, name: config.name.trim() };
    const configKey = `${CONFIG_PREFIX}${configId}`;

    // --- Size Check ---
    const estimatedSize = estimateConfigSize(configToSave);
    console.log(`Estimated config size for "${configToSave.name}": ${(estimatedSize / 1024 / 1024).toFixed(2)} MB`);
    if (estimatedSize > MAX_CONFIG_SIZE_BYTES) {
        console.error(`Config "${configToSave.name}" exceeds size limit (${MAX_CONFIG_SIZE_MB}MB). Size: ${estimatedSize} bytes.`);
        showNotification(`Configuration "${configToSave.name}" is too large to save (max ${MAX_CONFIG_SIZE_MB}MB). Try removing large knowledge files.`, "error", 7000);
        return null;
    }
    // --- End Size Check ---

    try {
        // Save the full configuration data
        localStorage.setItem(configKey, JSON.stringify(configToSave));

        // Update the config list metadata
        const configList = getConfigList();
        const configMetadata = {
            id: configId,
            name: configToSave.name,
            description: configToSave.description || ''
        };

        const index = configList.findIndex(c => c.id === configId);
        if (index !== -1) {
            configList[index] = configMetadata; // Update existing
        } else {
            configList.push(configMetadata); // Add new
        }

        // Sort list alphabetically by name for consistent dropdown order
        configList.sort((a, b) => a.name.localeCompare(b.name));

        if (saveConfigList(configList)) {
            console.log(`Configuration "${configToSave.name}" (ID: ${configId}) saved successfully.`);
            return configMetadata; // Return the metadata
        } else {
            // Rollback if list save failed
            localStorage.removeItem(configKey);
            return null;
        }

    } catch (error) {
        console.error(`Error saving GPT config "${configToSave.name}":`, error);
        // Handle QuotaExceededError specifically
        if (error.name === 'QuotaExceededError') {
            showNotification(`Could not save "${configToSave.name}". Storage limit exceeded. Try removing other configs or knowledge files.`, "error", 7000);
        } else {
            showNotification(`Error saving configuration "${configToSave.name}".`, "error");
        }
        // Attempt cleanup if save failed mid-way (though localStorage is usually atomic)
        localStorage.removeItem(configKey);
        return null;
    }
}

/**
 * Loads a specific Custom GPT configuration from localStorage.
 * @param {string} configId - The ID of the config to load.
 * @returns {object | null} The full configuration object, or null if not found or on error.
 */
export function loadConfig(configId) {
    if (!configId) return null;
    try {
        const configKey = `${CONFIG_PREFIX}${configId}`;
        const configJson = localStorage.getItem(configKey);
        if (!configJson) {
            console.warn(`GPT Config not found for ID: ${configId}`);
            showNotification(`Configuration not found (ID: ${configId}).`, "error");
            return null;
        }
        const config = JSON.parse(configJson);
        console.log(`Configuration "${config.name}" loaded.`);
        return config;
    } catch (error) {
        console.error(`Error loading GPT config ${configId}:`, error);
        showNotification(`Error loading configuration (ID: ${configId}).`, "error");
        return null;
    }
}

/**
 * Deletes a Custom GPT configuration from localStorage.
 * @param {string} configId - The ID of the config to delete.
 * @returns {boolean} True if deletion was successful, false otherwise.
 */
export function deleteConfig(configId) {
    if (!configId) return false;
    const configKey = `${CONFIG_PREFIX}${configId}`;
    const configList = getConfigList();
    const configToDelete = configList.find(c => c.id === configId);
    const configName = configToDelete ? `"${configToDelete.name}"` : `(ID: ${configId})`;

    try {
        // 1. Remove the config data
        localStorage.removeItem(configKey);

        // 2. Update the config list metadata
        const initialLength = configList.length;
        const updatedList = configList.filter(c => c.id !== configId);

        if (updatedList.length < initialLength) {
            if (saveConfigList(updatedList)) {
                console.log(`Configuration ${configName} deleted.`);
                return true;
            } else {
                // Attempt to restore the config data if list save failed? (Complex)
                console.error("Deleted config data but failed to update the list.");
                showNotification(`Error updating list after deleting ${configName}.`, "error");
                return false; // Indicate partial failure
            }
        } else {
            // Data key removed, but wasn't in the list. Consider it success.
            console.warn(`Config ID ${configId} not found in list during delete, but data key removed.`);
            return true;
        }
    } catch (error) {
        console.error(`Error deleting GPT config ${configName}:`, error);
        showNotification(`Error deleting configuration ${configName}.`, "error");
        return false;
    }
}