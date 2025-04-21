// ===== FILE: js/customGpt/knowledgeHandler.js =====

import { readTextFile, readPdfFile } from '../utils.js'; // Assuming these are in utils.js
import { showNotification } from '../components/notification.js';

// --- Constants ---
// Stricter limits for storing content directly in localStorage via gptStore
const MAX_KNOWLEDGE_FILES_PER_CONFIG = 5;
const MAX_KNOWLEDGE_FILE_SIZE_MB = 1; // Limit individual file size strictly
const MAX_KNOWLEDGE_FILE_SIZE_BYTES = MAX_KNOWLEDGE_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_KNOWLEDGE_TYPES = ['text/plain', 'text/markdown', 'application/pdf'];

/**
 * Processes a single uploaded file intended for knowledge.
 * Reads content based on type. Does NOT store it, returns data.
 * @param {File} file The file object to process.
 * @returns {Promise<{name: string, type: string, content: string} | {name: string, error: string}>} Resolves with file data or an error object.
 */
export async function processKnowledgeFile(file) {
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;
    console.log(`Processing knowledge file: ${fileName}, Type: ${fileType}, Size: ${fileSize}`);

    // --- Validation ---
    const fileTypeAllowed = ALLOWED_KNOWLEDGE_TYPES.includes(fileType) ||
        (fileType === '' && fileName.endsWith('.md')); // Allow empty type for .md

    if (!fileTypeAllowed) {
        const errorMsg = `File type not supported: ${fileType || 'Unknown'}. Allowed: TXT, MD, PDF.`;
        console.warn(`Skipping knowledge file: ${fileName} - ${errorMsg}`);
        return { name: fileName, error: errorMsg };
    }

    if (fileSize > MAX_KNOWLEDGE_FILE_SIZE_BYTES) {
        const errorMsg = `Exceeds size limit (${MAX_KNOWLEDGE_FILE_SIZE_MB}MB).`;
        console.warn(`Skipping knowledge file: ${fileName} - ${errorMsg}`);
        return { name: fileName, error: errorMsg };
    }
    // --- End Validation ---

    try {
        let content = '';
        if (fileType === 'application/pdf') {
            content = await readPdfFile(file); // Assumes readPdfFile handles its own errors/rejects
        } else { // text/plain, text/markdown
            content = await readTextFile(file); // Assumes readTextFile handles its own errors/rejects
        }
        console.log(`Successfully read content for knowledge file: ${fileName}`);
        return { name: fileName, type: fileType, content: content };
    } catch (error) {
        console.error(`Error reading knowledge file ${fileName}:`, error);
        const errorMsg = error.message || "Failed to read file content.";
        return { name: fileName, error: errorMsg };
    }
}

/**
 * Handles the file selection event for knowledge files.
 * Processes multiple files and calls a callback with the results.
 * @param {Event} event The file input change event.
 * @param {Array} existingFiles The list of knowledge files already associated with the config being edited.
 * @param {function(Array)} onComplete Callback function, receives an array of processed file results (success or error objects).
 */
export async function handleKnowledgeUpload(event, existingFiles = [], onComplete) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        return; // No files selected
    }

    let currentFileCount = existingFiles.length;
    const processingPromises = [];
    let filesSkipped = 0;

    console.log(`Handling knowledge upload: ${files.length} selected. Existing: ${currentFileCount}. Max per config: ${MAX_KNOWLEDGE_FILES_PER_CONFIG}.`);

    for (const file of files) {
        if (currentFileCount >= MAX_KNOWLEDGE_FILES_PER_CONFIG) {
            filesSkipped++;
            console.log("Max knowledge files reached, skipping further selection.");
            break; // Stop processing more files from this selection
        }

        // Check for duplicates based on name in existing files
        if (existingFiles.some(f => f.name === file.name)) {
            showNotification(`Knowledge file "${file.name}" is already added.`, 'warning');
            filesSkipped++;
            continue; // Skip duplicate
        }

        // Add promise to the list
        processingPromises.push(processKnowledgeFile(file));
        currentFileCount++; // Increment count for files being processed
    }

    if (filesSkipped > 0) {
        let message = `${filesSkipped} file(s) were skipped. `;
        if (currentFileCount >= MAX_KNOWLEDGE_FILES_PER_CONFIG) {
            message += `Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} knowledge files allowed per configuration.`;
        } else {
            message += `Check console for details (duplicates, type, size).`;
        }
        showNotification(message, 'warning', 5000);
    }

    // Wait for all selected files to be processed
    const results = await Promise.all(processingPromises);

    // Call the callback with the array of results
    if (typeof onComplete === 'function') {
        onComplete(results);
    }

    // Clear the input value after processing
    if (event.target) {
        event.target.value = '';
    }
}

// Export constants if needed elsewhere (e.g., for UI display)
export { MAX_KNOWLEDGE_FILES_PER_CONFIG };