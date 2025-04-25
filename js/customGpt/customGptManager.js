// customGptManager.js

import * as gptStore from './gptStore.js';
import { showNotification } from '../notificationHelper.js'; // Import showNotification

// 🔹 Export GPT to downloadable JSON
export async function exportGpt(id) { // <<< Make async
    if (!id) {
        showNotification("No GPT ID provided for export.", "warning");
        return;
    }
    try {
        const gpt = await gptStore.loadConfig(id); // <<< Await the async loadConfig
        if (!gpt) {
            showNotification(`GPT with ID "${id}" not found for export.`, "error");
            return;
        }

        // Ensure knowledge file content is included (loadConfig should return the full config)
        const blob = new Blob([JSON.stringify(gpt, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        // Sanitize filename slightly: replace spaces and invalid characters
        const safeName = (gpt.name || "custom-gpt").replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        a.download = `${safeName}.json`;
        document.body.appendChild(a); // Append to body to ensure click works in all browsers
        a.click();
        document.body.removeChild(a); // Clean up link
        URL.revokeObjectURL(url);
        showNotification(`GPT "${gpt.name}" exported successfully.`, "success");

    } catch (error) {
        console.error(`Error exporting GPT ID ${id}:`, error);
        showNotification(`Failed to export GPT: ${error.message}`, "error");
    }
}

// 🔹 Import GPT from uploaded file
export function importGptFromFile(file, onSuccess = () => { }) { // Keep outer function sync for event listener
    if (!file) {
        showNotification("No file selected for import.", "warning");
        return;
    }
    const reader = new FileReader();
    reader.onload = async function (event) { // <<< Make onload async
        try {
            const importedConfig = JSON.parse(event.target.result);

            // Basic validation of imported structure
            if (typeof importedConfig !== 'object' || importedConfig === null) {
                throw new Error("Invalid file format. Expected a JSON object.");
            }

            // Prepare the config object explicitly, excluding potentially problematic fields like 'id'
            // Let gptStore/dataService handle ID assignment/upsert logic.
            const configToSave = {
                // id: importedConfig.id, // <<< Explicitly OMIT ID from imported file
                name: (importedConfig.name || 'Imported GPT').trim(), // Ensure name exists and is trimmed
                description: importedConfig.description || '',
                instructions: importedConfig.instructions || '',
                // Ensure capabilities and knowledgeFiles are valid structures
                capabilities: typeof importedConfig.capabilities === 'object' && importedConfig.capabilities !== null
                                ? importedConfig.capabilities
                                : {},
                knowledgeFiles: Array.isArray(importedConfig.knowledgeFiles)
                                ? importedConfig.knowledgeFiles
                                    .filter(f => f && typeof f === 'object' && f.name && f.content) // Basic validation of file structure
                                    .map(f => ({ // Ensure files have correct structure
                                        name: f.name,
                                        type: f.type || 'text/plain', // Default type if missing
                                        content: f.content
                                    }))
                                : []
            };

            // Add more validation if needed (e.g., check knowledge file sizes if importing to localStorage)

            console.log("Attempting to save imported config:", configToSave); // Log what's being saved

            // Save using gptStore (now async)
            const savedMeta = await gptStore.saveConfig(configToSave); // <<< AWAIT the save

            if (savedMeta && savedMeta.id) { // Check for savedMeta and its id
                // Load the newly saved full config to pass to onSuccess
                const fullSavedConfig = await gptStore.loadConfig(savedMeta.id);
                if (fullSavedConfig) {
                    onSuccess(fullSavedConfig, savedMeta.id); // Pass the full config as saved
                    console.log(`GPT "${savedMeta.name}" imported successfully with ID: ${savedMeta.id}`);
                    // Notification is handled by gptStore.saveConfig
                } else {
                     throw new Error("Failed to reload the imported GPT after saving.");
                }
            } else {
                // Error should have been shown by gptStore/dataService
                console.error("Import failed: gptStore.saveConfig did not return valid metadata.");
                // Throwing an error here will be caught below
                throw new Error("Failed to save imported GPT configuration. Check console for details.");
            }
        } catch (err) {
            console.error("Import failed:", err);
            showNotification(`Import failed: ${err.message}`, "error"); // Use showNotification
        } finally {
            // Clear the file input that triggered this (if possible/needed)
            // This usually needs access to the original input element.
        }
    };
    reader.onerror = (err) => {
        console.error("File reading error during import:", err);
        showNotification("Failed to read the selected file.", "error");
    };
    reader.readAsText(file);
}
