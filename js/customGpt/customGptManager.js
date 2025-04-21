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
export function importGptFromFile(file, onSuccess = () => { }) {
    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const importedConfig = JSON.parse(event.target.result);
            
            // Prepare the config object with required fields
            const configToSave = {
                ...importedConfig,
                name: importedConfig.name || 'Imported GPT',
                description: importedConfig.description || '',
                instructions: importedConfig.instructions || '',
                capabilities: importedConfig.capabilities || {},
                knowledgeFiles: importedConfig.knowledgeFiles || []
            };
            
            // Save using gptStore
            const savedMeta = gptStore.saveConfig(configToSave);
            
            if (savedMeta) {
                onSuccess(configToSave, savedMeta.id);
                console.log(`GPT "${savedMeta.name}" imported successfully with ID: ${savedMeta.id}`);
            } else {
                throw new Error("Failed to save imported GPT configuration");
            }
        } catch (err) {
            console.error("Import failed:", err);
            alert("Import failed: " + err.message);
        }
    };
    reader.readAsText(file);
}
