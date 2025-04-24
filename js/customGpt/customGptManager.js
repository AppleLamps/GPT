// customGptManager.js

import * as gptStore from './gptStore.js';

// 🔹 Export GPT to downloadable JSON
export function exportGpt(id) {
    const gpt = gptStore.loadConfig(id);
    if (!gpt) {
        alert("GPT not found.");
        return;
    }

    const blob = new Blob([JSON.stringify(gpt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${gpt.name || "custom-gpt"}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

// 🔹 Import GPT from uploaded file
export function importGptFromFile(file, onSuccess = () => { }) { // Keep outer function sync for event listener
    const reader = new FileReader();
    reader.onload = async function (event) { // <<< Make onload async
        try {
            const importedConfig = JSON.parse(event.target.result);

            // Prepare the config object explicitly, excluding potentially problematic fields like 'id'
            // Let gptStore/dataService handle ID assignment/upsert logic.
            const configToSave = {
                // id: importedConfig.id, // <<< Explicitly OMIT ID from imported file
                name: importedConfig.name || 'Imported GPT',
                description: importedConfig.description || '',
                instructions: importedConfig.instructions || '',
                // Ensure capabilities and knowledgeFiles are valid structures
                capabilities: typeof importedConfig.capabilities === 'object' && importedConfig.capabilities !== null
                                ? importedConfig.capabilities
                                : {},
                knowledgeFiles: Array.isArray(importedConfig.knowledgeFiles)
                                ? importedConfig.knowledgeFiles.map(f => ({ // Ensure files have correct structure
                                    name: f.name || 'Unnamed File',
                                    type: f.type || 'text/plain',
                                    content: f.content || ''
                                  }))
                                : []
            };

            console.log("Attempting to save imported config:", configToSave); // Log what's being saved

            // Save using gptStore (now async)
            const savedMeta = await gptStore.saveConfig(configToSave); // <<< AWAIT the save

            if (savedMeta && savedMeta.id) { // Check for savedMeta and its id
                // Pass the original config *before* saving (without generated ID) and the *new* ID
                onSuccess(configToSave, savedMeta.id);
                console.log(`GPT "${savedMeta.name}" imported successfully with ID: ${savedMeta.id}`);
            } else {
                // Error should have been shown by gptStore/dataService
                console.error("Import failed: gptStore.saveConfig did not return valid metadata.");
                throw new Error("Failed to save imported GPT configuration. Check console for details.");
            }
        } catch (err) {
            console.error("Import failed:", err);
            alert("Import failed: " + err.message);
        }
    };
    reader.readAsText(file);
}
