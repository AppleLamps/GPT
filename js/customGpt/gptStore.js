// ===== FILE: js/customGpt/gptStore.js =====

// Assuming generateId is in utils.js or create it here/in utils
import { generateId } from '../utils.js';
import { showNotification } from '../notificationHelper.js';
import { getCurrentUserState } from '../state.js'; // Import user state check
import * as dataService from '../dataService.js'; // Import Supabase functions

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
 * Retrieves the list of Custom GPT config metadata. Uses Supabase if logged in, otherwise localStorage.
 * @returns {Promise<Array<{id: string, name: string, description?: string}>>} An array of config metadata objects.
 */
export async function getConfigList() {
    const user = getCurrentUserState();
    if (user) {
        try {
            console.log("Fetching GPT config list from Supabase...");
            const list = await dataService.getCustomGptList();
            // Sort list alphabetically by name for consistent dropdown order (dataService might already do this)
            list.sort((a, b) => a.name.localeCompare(b.name));
            return list;
        } catch (error) {
            console.error("Error getting GPT config list from Supabase:", error);
            showNotification("Could not load your Custom GPTs from the cloud.", "error");
            return []; // Return empty list on Supabase error
        }
    } else {
        // Fallback to localStorage if not logged in
        console.log("Fetching GPT config list from localStorage (not logged in).");
        try {
            const listJson = localStorage.getItem(CONFIG_LIST_KEY);
            const list = listJson ? JSON.parse(listJson) : [];
            // Ensure sorting for localStorage too
            list.sort((a, b) => a.name.localeCompare(b.name));
            return list;
        } catch (error) {
            console.error("Error getting GPT config list from localStorage:", error);
            return [];
        }
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
 * Saves a Custom GPT configuration. Uses Supabase if logged in, otherwise localStorage.
 * Includes size check before saving to localStorage. Supabase has its own limits.
 * @param {object} config - The configuration object { id?, name, description, instructions, knowledgeFiles: [{name, type, content}], capabilities: {} }.
 * @returns {Promise<{id: string, name: string, description?: string} | null>} The metadata of the saved/updated config, or null on failure.
 */
export async function saveConfig(config) {
    const user = getCurrentUserState();

    if (!config || !config.name || !config.name.trim()) {
        console.error("Attempted to save an invalid or unnamed config.");
        showNotification("Configuration must have a name.", "error");
        return null;
    }

    const configNameToSave = config.name.trim(); // Use trimmed name consistently

    // Use Supabase if logged in
    if (user) {
        console.log(`Saving GPT config "${configNameToSave}" to Supabase...`);
        try {
            // dataService.saveCustomGpt handles ID generation/upsert
            // Ensure the config being sent has the trimmed name
            const configForSupabase = { ...config, name: configNameToSave };
            const savedMetadata = await dataService.saveCustomGpt(configForSupabase);
            if (savedMetadata) {
                console.log(`Configuration "${savedMetadata.name}" (ID: ${savedMetadata.id}) saved successfully to Supabase.`);
                showNotification(`Configuration "${savedMetadata.name}" saved.`, "success");
                return savedMetadata;
            } else {
                // Error handled within dataService, just return null
                return null;
            }
        } catch (error) {
            // Error already shown by dataService, just log and return null
            console.error(`Error saving GPT config "${configNameToSave}" to Supabase:`, error);
            return null;
        }
    } else {
        // Fallback to localStorage if not logged in
        console.log(`Saving GPT config "${configNameToSave}" to localStorage (not logged in).`);
        const configId = config.id || generateId('cfg'); // Generate ID if it's new
        const configToSave = { ...config, id: configId, name: configNameToSave }; // Use trimmed name
        const configKey = `${CONFIG_PREFIX}${configId}`;

        // --- Size Check for localStorage ---
        const estimatedSize = estimateConfigSize(configToSave);
        console.log(`Estimated localStorage config size for "${configToSave.name}": ${(estimatedSize / 1024 / 1024).toFixed(2)} MB`);
        if (estimatedSize > MAX_CONFIG_SIZE_BYTES) {
            console.error(`Config "${configToSave.name}" exceeds localStorage size limit (${MAX_CONFIG_SIZE_MB}MB). Size: ${estimatedSize} bytes.`);
            showNotification(`Configuration "${configToSave.name}" is too large for local storage (max ${MAX_CONFIG_SIZE_MB}MB). Try removing large knowledge files or log in to save to the cloud.`, "error", 7000);
            return null;
        }
        // --- End Size Check ---

        try {
            // Save the full configuration data to localStorage
            localStorage.setItem(configKey, JSON.stringify(configToSave));

            // Update the localStorage config list metadata
            // Fetch current list (will be from localStorage as user is null)
            const configList = await getConfigList();
            const configMetadata = {
                id: configId,
                name: configToSave.name, // Already trimmed
                description: configToSave.description || ''
            };

            const index = configList.findIndex(c => c.id === configId);
            if (index !== -1) {
                configList[index] = configMetadata; // Update existing
            } else {
                configList.push(configMetadata); // Add new
            }

            // Sort list alphabetically
            configList.sort((a, b) => a.name.localeCompare(b.name));

            if (saveConfigList(configList)) { // saveConfigList only affects localStorage
                console.log(`Configuration "${configToSave.name}" (ID: ${configId}) saved successfully to localStorage.`);
                showNotification(`Configuration "${configToSave.name}" saved locally.`, "success");
                return configMetadata; // Return the metadata
            } else {
                // Rollback if list save failed
                localStorage.removeItem(configKey);
                return null;
            }

        } catch (error) {
            console.error(`Error saving GPT config "${configToSave.name}" to localStorage:`, error);
            if (error.name === 'QuotaExceededError' || (error.message && error.message.toLowerCase().includes('quota'))) {
                showNotification(`Could not save "${configToSave.name}" locally. Storage limit exceeded. Try removing other configs or knowledge files.`, "error", 7000);
            } else {
                showNotification(`Error saving configuration "${configToSave.name}" locally.`, "error");
            }
            localStorage.removeItem(configKey); // Attempt cleanup
            return null;
        }
    }
}

/**
 * Loads a specific Custom GPT configuration. Uses Supabase if logged in, otherwise localStorage.
 * @param {string} configId - The ID of the config to load.
 * @returns {Promise<object | null>} The full configuration object, or null if not found or on error.
 */
export async function loadConfig(configId) {
    if (!configId) return null;
    const user = getCurrentUserState();

    if (user) {
        console.log(`Loading GPT config ID ${configId} from Supabase...`);
        try {
            const config = await dataService.loadCustomGpt(configId);
            if (config) {
                console.log(`Configuration "${config.name}" loaded from Supabase.`);
                return config;
            } else {
                console.warn(`GPT Config not found in Supabase for ID: ${configId}`);
                showNotification(`Configuration not found (ID: ${configId}).`, "warning");
                return null;
            }
        } catch (error) {
            console.error(`Error loading GPT config ${configId} from Supabase:`, error);
            showNotification(`Error loading configuration (ID: ${configId}).`, "error");
            return null;
        }
    } else {
        // Fallback to localStorage if not logged in
        console.log(`Loading GPT config ID ${configId} from localStorage (not logged in).`);
        try {
            const configKey = `${CONFIG_PREFIX}${configId}`;
            const configJson = localStorage.getItem(configKey);
            if (!configJson) {
                console.warn(`GPT Config not found in localStorage for ID: ${configId}`);
                showNotification(`Configuration not found locally (ID: ${configId}).`, "warning");
                return null;
            }
            const config = JSON.parse(configJson);
            console.log(`Configuration "${config.name}" loaded from localStorage.`);
            return config;
        } catch (error) {
            console.error(`Error loading GPT config ${configId} from localStorage:`, error);
            showNotification(`Error loading configuration locally (ID: ${configId}).`, "error");
            return null;
        }
    }
}

/**
 * Deletes a Custom GPT configuration. Uses Supabase if logged in, otherwise localStorage.
 * @param {string} configId - The ID of the config to delete.
 * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
 */
export async function deleteConfig(configId) {
    if (!configId) return false;
    const user = getCurrentUserState();

    // Determine name for logging/notifications before potential deletion
    // This requires fetching the list first, which is slightly less efficient
    // but provides better user feedback.
    let configName = `(ID: ${configId})`;
    try {
        const list = await getConfigList(); // Gets list from Supabase or localStorage
        const configMeta = list.find(c => c.id === configId);
        if (configMeta) {
            configName = `"${configMeta.name}"`;
        }
    } catch (e) { /* Ignore error fetching list for name */ }


    if (user) {
        console.log(`Deleting GPT config ${configName} from Supabase...`);
        try {
            const success = await dataService.deleteCustomGpt(configId);
            if (success) {
                console.log(`Configuration ${configName} deleted from Supabase.`);
                showNotification(`Configuration ${configName} deleted.`, "success");
            } else {
                // Error message shown by dataService
                console.error(`Failed to delete configuration ${configName} from Supabase.`);
            }
            return success;
        } catch (error) {
            // Error message shown by dataService
            console.error(`Error deleting GPT config ${configName} from Supabase:`, error);
            return false;
        }
    } else {
        // Fallback to localStorage if not logged in
        console.log(`Deleting GPT config ${configName} from localStorage (not logged in).`);
        const configKey = `${CONFIG_PREFIX}${configId}`;
        try {
            // 1. Remove the config data from localStorage
            localStorage.removeItem(configKey);

            // 2. Update the localStorage config list metadata
            const configList = await getConfigList(); // Will be from localStorage
            const initialLength = configList.length;
            const updatedList = configList.filter(c => c.id !== configId);

            if (updatedList.length < initialLength) {
                if (saveConfigList(updatedList)) { // saveConfigList only affects localStorage
                    console.log(`Configuration ${configName} deleted from localStorage.`);
                    showNotification(`Configuration ${configName} deleted locally.`, "success");
                    return true;
                } else {
                    // Attempt to restore the config data if list save failed? (More complex)
                    console.error("Deleted config data from localStorage but failed to update the list.");
                    showNotification(`Error updating local list after deleting ${configName}.`, "error");
                    // Maybe try to restore? For now, return false.
                    // const configJson = localStorage.getItem(configKey); // This won't work, it's already removed
                    return false; // Indicate partial failure
                }
            } else {
                // Data key removed, but wasn't in the list. Consider it success for localStorage.
                console.warn(`Config ID ${configId} not found in localStorage list during delete, but data key removed.`);
                return true;
            }
        } catch (error) {
            console.error(`Error deleting GPT config ${configName} from localStorage:`, error);
            showNotification(`Error deleting configuration ${configName} locally.`, "error");
            return false;
        }
    }
}
