// ===== FILE: js/customGpt/knowledgeHandler.js =====

import { readTextFile, readPdfFile } from '../utils.js'; // Assuming these are in utils.js
import { showNotification } from '../notificationHelper.js'; // Corrected import path

// --- Constants ---
// Stricter limits for storing content directly in localStorage via gptStore
const MAX_KNOWLEDGE_FILES_PER_CONFIG = 5;
const MAX_KNOWLEDGE_FILE_SIZE_MB = 1; // Limit individual file size strictly
const MAX_KNOWLEDGE_FILE_SIZE_BYTES = MAX_KNOWLEDGE_FILE_SIZE_MB * 1024 * 1024;
// Consider using a Set for slightly faster lookups if this list grows, but Array is fine for now.
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
    // Allow empty type only if the filename ends with .md (case-insensitive)
    const isAllowedExtension = fileType === '' && fileName.toLowerCase().endsWith('.md');
    const fileTypeAllowed = ALLOWED_KNOWLEDGE_TYPES.includes(fileType) || isAllowedExtension;

    if (!fileTypeAllowed) {
        const errorMsg = `File type not supported: ${fileType || 'Unknown'} (${fileName}). Allowed: TXT, MD, PDF.`;
        console.warn(`Skipping knowledge file: ${fileName} - ${errorMsg}`);
        return { name: fileName, error: errorMsg };
    }

    if (fileSize > MAX_KNOWLEDGE_FILE_SIZE_BYTES) {
        const errorMsg = `File "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds size limit (${MAX_KNOWLEDGE_FILE_SIZE_MB}MB).`;
        console.warn(`Skipping knowledge file: ${fileName} - ${errorMsg}`);
        return { name: fileName, error: errorMsg };
    }
    // --- End Validation ---

    try {
        let content = '';
        // Handle PDF specifically
        if (fileType === 'application/pdf') {
            content = await readPdfFile(file); // Assumes readPdfFile handles its own errors/rejects
        } else { // Handle text/plain, text/markdown, or .md with empty type
            content = await readTextFile(file); // Assumes readTextFile handles its own errors/rejects
        }
        console.log(`Successfully read content for knowledge file: ${fileName}`);
        // Ensure type is set correctly even if originally empty but allowed via extension
        const finalType = fileType || (isAllowedExtension ? 'text/markdown' : 'unknown');
        return { name: fileName, type: finalType, content: content };
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
 * @param {Array<{name: string}>} existingFiles The list of knowledge files already associated with the config being edited (only need names for duplicate check).
 * @param {function(Array)} onComplete Callback function, receives an array of processed file results (success or error objects).
 */
export async function handleKnowledgeUpload(event, existingFiles = [], onComplete) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        return; // No files selected
    }

    let currentFileCount = existingFiles.length;
    const processingPromises = [];
    let filesSkippedCount = 0;
    let limitReached = false;
    const duplicateFileNames = new Set(existingFiles.map(f => f.name)); // Use Set for faster duplicate checks

    console.log(`Handling knowledge upload: ${files.length} selected. Existing: ${currentFileCount}. Max per config: ${MAX_KNOWLEDGE_FILES_PER_CONFIG}.`);

    for (const file of files) {
        if (currentFileCount >= MAX_KNOWLEDGE_FILES_PER_CONFIG) {
            if (!limitReached) { // Log only once
                console.log("Max knowledge files reached, skipping further selection.");
                limitReached = true;
            }
            filesSkippedCount++;
            continue; // Skip processing if limit already met by existing + previously processed in this batch
        }

        // Check for duplicates based on name (using the Set)
        if (duplicateFileNames.has(file.name)) {
            showNotification(`Knowledge file "${file.name}" is already added.`, 'warning');
            filesSkippedCount++;
            continue; // Skip duplicate
        }

        // Add promise to the list and add name to duplicate check for this batch
        processingPromises.push(processKnowledgeFile(file));
        duplicateFileNames.add(file.name); // Prevent adding the same file twice from the *same* selection event
        currentFileCount++; // Increment count for files being processed
    }

    if (filesSkippedCount > 0) {
        let message = `${filesSkippedCount} file(s) were skipped. `;
        if (limitReached) {
            message += `Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} knowledge files allowed per configuration.`;
        } else {
            // If limit wasn't reached, skips must be duplicates
            message += `Duplicate file names were skipped.`;
        }
        showNotification(message, 'warning', 5000);
    }

    // Wait for all selected files to be processed
    const results = await Promise.all(processingPromises);

    // Call the callback with the array of results
    if (typeof onComplete === 'function') {
        onComplete(results);
    }

    // Clear the input value after processing to allow re-selecting the same file if needed
    if (event.target) {
        event.target.value = '';
    }
}

// Export constants if needed elsewhere (e.g., for UI display)
export { MAX_KNOWLEDGE_FILES_PER_CONFIG, MAX_KNOWLEDGE_FILE_SIZE_MB }; // Export MB limit too if useful for UI