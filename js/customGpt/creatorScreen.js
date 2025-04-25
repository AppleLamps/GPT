// ===== FILE: js/customGpt/creatorScreen.js =====

import * as state from '../state.js';
import * as gptStore from './gptStore.js';
import { handleKnowledgeUpload, MAX_KNOWLEDGE_FILES_PER_CONFIG } from './knowledgeHandler.js';
import { showNotification } from '../notificationHelper.js';
import { escapeHTML } from '../utils.js';
import { renderCustomGptList } from '../components/sidebar.js'; // Import function to refresh sidebar list
import { updateActiveGptDisplay } from '../components/header.js'; // Import function to update header

// --- DOM Elements (within #gptCreatorModal) ---
let gptCreatorModal;
let creatorModalTitle;
let editingGptIdInput; // Hidden input to store ID when editing

let gptNameInput;
let gptDescriptionInput;
let gptInstructionsInput;
let capWebSearchCheckbox;
let capImageGenCheckbox;
// Add other capability checkboxes here if implemented

let knowledgeUploadInput;
let knowledgeUploadButton;
let knowledgeFileListContainer;

let saveNewGptButton; // Actually the 'Save' button (used for create/update)
let updateGptButton; // Kept for potential future split, but logic merged into 'save' for now
let clearGptFormButton;
let closeCreatorModalBtn;

// --- State for UI ---
// Keep track of the files being edited *within the modal*
let currentEditingKnowledgeFiles = []; // Array of {name, type, content, error?}
let currentEditMode = false; // Track if the modal is for creating or editing
let isSaving = false; // Prevent double-clicks on save

/**
 * Initializes the Creator Screen module by finding elements and attaching listeners.
 */
export function initializeCreatorScreen() {
    console.log("Initializing Custom GPT Creator Screen...");

    // --- Find DOM Elements ---
    gptCreatorModal = document.getElementById('gptCreatorModal');
    creatorModalTitle = document.getElementById('creatorModalTitle');
    editingGptIdInput = document.getElementById('editingGptId'); // Hidden input

    gptNameInput = document.getElementById('gptName_creator');
    gptDescriptionInput = document.getElementById('gptDescription_creator');
    gptInstructionsInput = document.getElementById('gptInstructions_creator');
    capWebSearchCheckbox = document.getElementById('capWebSearch_creator');
    capImageGenCheckbox = document.getElementById('capImageGen_creator');
    // Find other capability checkboxes...

    knowledgeUploadInput = document.getElementById('knowledgeUpload_creator');
    knowledgeUploadButton = document.getElementById('knowledgeUploadButton_creator');
    knowledgeFileListContainer = document.getElementById('knowledgeFileList_creator');

    saveNewGptButton = document.getElementById('saveNewGptButton'); // 'Save' button
    updateGptButton = document.getElementById('updateGptButton'); // 'Update' button (might be hidden/merged)
    clearGptFormButton = document.getElementById('clearGptFormButton');
    closeCreatorModalBtn = document.getElementById('closeCreatorModalBtn');

    // Basic check if elements were found
    if (!gptCreatorModal || !gptNameInput || !knowledgeUploadButton || !saveNewGptButton || !closeCreatorModalBtn) {
        console.error("One or more essential Custom GPT Creator UI elements were not found. Feature disabled.");
        // Optionally disable the 'Add' button in the sidebar
        const addBtn = document.getElementById('addCustomGptBtn');
        if (addBtn) addBtn.disabled = true;
        return;
    }

    // --- Attach Event Listeners ---
    closeCreatorModalBtn?.addEventListener('click', closeCreatorModal);
    saveNewGptButton?.addEventListener('click', handleSaveOrUpdateGpt);
    // updateGptButton?.addEventListener('click', handleUpdateGpt); // Logic merged into handleSaveOrUpdateGpt
    clearGptFormButton?.addEventListener('click', handleClearForm);

    // Trigger hidden file input from styled button
    knowledgeUploadButton?.addEventListener('click', () => knowledgeUploadInput?.click());
    // Handle file selection using knowledgeHandler
    knowledgeUploadInput?.addEventListener('change', (event) => {
        // Pass the current editing files list and the callback
        handleKnowledgeUpload(event, currentEditingKnowledgeFiles, onKnowledgeFilesProcessed);
    });

    // Use event delegation for removing knowledge files
    knowledgeFileListContainer?.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-knowledge-file')) {
            handleRemoveKnowledgeFile(event);
        }
    });

    // Listen to form inputs to enable/disable save buttons
    gptNameInput?.addEventListener('input', updateButtonStates);

    // Optional: Close modal if clicking background overlay
    gptCreatorModal?.addEventListener('click', (event) => {
        if (event.target === gptCreatorModal) {
            closeCreatorModal();
        }
    });

    console.log("Custom GPT Creator Screen Initialized.");
}

/**
 * Opens the Creator modal.
 * @param {object | null} configData - If provided, populates the form for editing. If null, opens in "new" mode.
 */
export function openCreatorModal(configData = null) {
    if (!gptCreatorModal || isSaving) return; // Prevent opening if already saving

    currentEditMode = !!configData; // Set mode based on whether configData exists
    isSaving = false; // Reset saving flag

    if (currentEditMode) {
        console.log(`Opening creator modal in EDIT mode for: ${configData.name} (ID: ${configData.id})`);
        if (creatorModalTitle) creatorModalTitle.textContent = "Edit Custom GPT";
        loadConfigIntoForm(configData); // Load existing data
        editingGptIdInput.value = configData.id || ''; // Store ID
    } else {
        console.log("Opening creator modal in NEW mode.");
        if (creatorModalTitle) creatorModalTitle.textContent = "Create Custom GPT";
        loadConfigIntoForm(null); // Clear the form for new entry
        editingGptIdInput.value = ''; // Clear ID
    }

    updateButtonStates(); // Set initial button states (including save button text)
    gptCreatorModal.classList.add('visible');
    gptNameInput?.focus(); // Focus name input on open
}

/**
 * Closes the Creator modal.
 */
export function closeCreatorModal() {
    if (!gptCreatorModal) return;
    gptCreatorModal.classList.remove('visible');
    // Clear editing state when closing
    currentEditingKnowledgeFiles = [];
    editingGptIdInput.value = '';
    currentEditMode = false;
    isSaving = false; // Reset saving flag
    // Clear the file input value in case the modal is reopened without page refresh
    if (knowledgeUploadInput) {
        knowledgeUploadInput.value = '';
    }
    console.log("Creator modal closed.");
}

/**
 * Loads data from a configuration object into the form fields.
 * @param {object | null} config The configuration object to load, or null to clear.
 */
function loadConfigIntoForm(config) {
    // Ensure elements exist (redundant check, but safe)
    if (!gptNameInput || !gptDescriptionInput || !gptInstructionsInput || !capWebSearchCheckbox || !knowledgeFileListContainer) {
        console.error("Required form elements not found during loadConfigIntoForm");
        return;
    }

    if (config) {
        console.log("Loading config into form:", config.name, `(ID: ${config.id})`);
        // Basic fields
        gptNameInput.value = config.name || '';
        gptDescriptionInput.value = config.description || '';
        gptInstructionsInput.value = config.instructions || '';

        // Capabilities
        capWebSearchCheckbox.checked = config.capabilities?.webSearch || false;
        if (capImageGenCheckbox) {
            capImageGenCheckbox.checked = config.capabilities?.imageGeneration || false;
        }
        // Load other capabilities...

        // Knowledge files - Create a deep copy for editing
        if (Array.isArray(config.knowledgeFiles)) {
            // Filter out any potential null/undefined entries just in case
            currentEditingKnowledgeFiles = config.knowledgeFiles
                .filter(f => f && typeof f === 'object')
                .map(f => ({ ...f })); // Create copies
            console.log("Loaded knowledge files for editing:", currentEditingKnowledgeFiles.length);
        } else {
            currentEditingKnowledgeFiles = [];
            console.log("No knowledge files in config to load.");
        }
    } else {
        // Clear the form
        console.log("Clearing creator form for new entry.");
        gptNameInput.value = '';
        gptDescriptionInput.value = '';
        gptInstructionsInput.value = '';
        capWebSearchCheckbox.checked = false;
        if (capImageGenCheckbox) {
            capImageGenCheckbox.checked = false;
        }
        // Clear other capabilities...
        currentEditingKnowledgeFiles = []; // Clear knowledge files state
    }

    // Always render the knowledge file list based on currentEditingKnowledgeFiles
    renderKnowledgeFileList();
}


/**
 * Reads the current values from the form fields into a config object structure.
 * Includes ID if in edit mode.
 * @returns {object} A configuration object based on form values.
 */
function getConfigFromForm() {
    const config = {
        // Include ID only if we are updating an existing one and it's set
        id: currentEditMode && editingGptIdInput.value ? editingGptIdInput.value : undefined,
        name: gptNameInput?.value.trim() || '',
        description: gptDescriptionInput?.value.trim() || '',
        instructions: gptInstructionsInput?.value.trim() || '',
        capabilities: {
            webSearch: capWebSearchCheckbox?.checked || false,
            imageGeneration: capImageGenCheckbox?.checked || false,
            // Add other capabilities here...
        },
        // Use the current state of the files being edited, ensuring no 'error' property is saved
        knowledgeFiles: currentEditingKnowledgeFiles
            .filter(f => !f.error) // Only include files without processing errors
            .map(f => ({ name: f.name, type: f.type, content: f.content })) // Store only necessary data
    };
    // Remove id property if it's undefined (when creating new)
    if (config.id === undefined) {
        delete config.id;
    }
    console.log("Config data extracted from form:", config);
    return config;
}

/**
 * Renders the list of knowledge files in the UI based on `currentEditingKnowledgeFiles`.
 */
function renderKnowledgeFileList() {
    if (!knowledgeFileListContainer) return;

    if (!currentEditingKnowledgeFiles.length) {
        knowledgeFileListContainer.innerHTML = '<div class="no-files-note">No knowledge files attached.</div>';
    } else {
        const fileListHTML = currentEditingKnowledgeFiles.map((file, index) => `
            <div class="knowledge-file-item ${file.error ? 'has-error' : ''}" data-index="${index}" title="${escapeHTML(file.name)}${file.error ? ` - ERROR: ${escapeHTML(file.error)}` : ''}">
                <span class="file-icon">📄</span>
                <span class="file-name">${escapeHTML(file.name)}</span>
                ${file.error ? `<span class="file-error-badge" title="${escapeHTML(file.error)}">!</span>` : ''}
                <button class="remove-knowledge-file" title="Remove file" data-index="${index}" aria-label="Remove ${escapeHTML(file.name)}">×</button>
            </div>
        `).join('');
        knowledgeFileListContainer.innerHTML = fileListHTML;
    }

    // Update upload button state and title
    const limitReached = currentEditingKnowledgeFiles.length >= MAX_KNOWLEDGE_FILES_PER_CONFIG;
    if (knowledgeUploadButton) {
        knowledgeUploadButton.disabled = limitReached;
        knowledgeUploadButton.title = limitReached
            ? `Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} knowledge files reached`
            : `Upload Knowledge Files (.txt, .md, .pdf, max ${MAX_KNOWLEDGE_FILES_PER_CONFIG} total)`;
    }
     // Update knowledgeUploadInput accept attribute dynamically (optional but good UX)
    // if (knowledgeUploadInput) {
    //     knowledgeUploadInput.accept = ".txt,.md,.pdf,text/plain,text/markdown,application/pdf";
    // }
}


/**
 * Callback function after knowledge files have been processed by knowledgeHandler.
 * Updates the `currentEditingKnowledgeFiles` list in the modal.
 * @param {Array} results Array of processed file results {name, type?, content?, error?}.
 */
function onKnowledgeFilesProcessed(results) {
    let filesAddedCount = 0;
    let filesErroredCount = 0;
    let limitReachedDuringAdd = false;

    results.forEach(result => {
        // Check limit before attempting to add
        if (currentEditingKnowledgeFiles.length >= MAX_KNOWLEDGE_FILES_PER_CONFIG) {
            if (!limitReachedDuringAdd) { // Notify only once per batch
                console.warn("Max files reached during processing callback, discarding further results.");
                showNotification(`Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} files allowed. Some uploads were ignored.`, 'warning');
                limitReachedDuringAdd = true;
            }
            filesErroredCount++; // Count files skipped due to limit as errors for feedback
            return; // Stop adding if max is reached
        }

        // Check if already exists (double check - handleKnowledgeUpload should prevent this, but belt-and-suspenders)
        if (currentEditingKnowledgeFiles.some(f => f.name === result.name)) {
            console.warn(`Knowledge file "${result.name}" already exists in list, skipping add.`);
            // Optionally notify user again? Or rely on handleKnowledgeUpload's notification?
            // showNotification(`File "${result.name}" was already in the list.`, 'info');
            return;
        }

        if (result.error) {
            filesErroredCount++;
            // Add the file with error info to the list so user sees it failed and can remove it
            currentEditingKnowledgeFiles.push({
                name: result.name,
                error: result.error, // Store the error message
                content: null,       // No content available
                type: result.type || 'unknown'
            });
            // Notification is handled by knowledgeHandler, but maybe show a summary later
        } else if (result.content !== undefined) {
            filesAddedCount++;
            // Add the successfully processed file
            currentEditingKnowledgeFiles.push({
                name: result.name,
                type: result.type || 'unknown', // Ensure type is stored
                content: result.content,
                error: null // Explicitly set error to null
            });
        } else {
            // Should not happen if processKnowledgeFile always returns content or error
            console.warn("Processed file result is missing both content and error:", result.name);
            filesErroredCount++;
             currentEditingKnowledgeFiles.push({ name: result.name, error: "Unknown processing issue", content: null, type: 'unknown' });
        }
    });

    if (filesAddedCount > 0) {
        console.log(`${filesAddedCount} knowledge file(s) processed and added to modal edit list.`);
        showNotification(`${filesAddedCount} file(s) added successfully.`, 'success', 2000);
    }
    if (filesErroredCount > 0 && !limitReachedDuringAdd) { // Don't show error count if limit was the main issue reported
        console.warn(`${filesErroredCount} knowledge file(s) had processing errors or were skipped.`);
         showNotification(`${filesErroredCount} file(s) could not be added. See list for details.`, 'warning');
    }

    renderKnowledgeFileList(); // Update UI list
    updateButtonStates(); // Update button states (e.g., disable upload if limit reached)
}


// --- Button Actions ---

/**
 * Handles the unified "Save" / "Update" button click. Now async.
 */
async function handleSaveOrUpdateGpt() { // <<< Make async
    if (isSaving) return; // Prevent double-clicks

    const config = getConfigFromForm(); // Gets data, includes ID if in edit mode

    if (!config.name) {
        showNotification("Please enter a name for the Custom GPT.", "warning");
        gptNameInput?.focus();
        return;
    }

    // Disable button and show loading state
    isSaving = true;
    updateButtonStates(); // Reflect saving state in button

    try {
        // gptStore.saveConfig handles create vs update based on presence of config.id
        const savedMeta = await gptStore.saveConfig(config); // <<< Await async call

        if (savedMeta && savedMeta.id) {
            const action = currentEditMode ? "updated" : "saved";
            console.log(`Custom GPT "${savedMeta.name}" ${action} successfully. ID: ${savedMeta.id}`);
            // Notification is shown by saveConfig

            // Reload the full config to ensure we have the final data
            const fullConfig = await gptStore.loadConfig(savedMeta.id); // <<< Await async call
            if (fullConfig) {
                // If the saved/updated GPT was the one being created/edited,
                // or if it's a new one, make it the active one.
                console.log(`Setting active GPT to ${action} config: ${fullConfig.name}`);
                state.setActiveCustomGptConfig(fullConfig); // Make it active
                updateActiveGptDisplay(); // Update header display
                // Consider if chat history should be cleared here
                // state.clearChatHistory(); // Example if needed
            } else {
                console.warn(`Failed to reload the config (ID: ${savedMeta.id}) after saving, cannot set as active.`);
                // Might still want to clear active config if the previous one was deleted/invalid?
                state.setActiveCustomGptConfig(null);
                updateActiveGptDisplay();
            }

            closeCreatorModal(); // Close modal on success
            renderCustomGptList(); // Update sidebar list

        } else {
            // saveConfig shows error notification on failure
            console.error(`Failed to ${currentEditMode ? 'update' : 'save'} config. saveConfig returned null.`);
            // Keep modal open for user to fix potential issues (like size limit)
        }
    } catch (error) {
        // Catch any unexpected errors during the save/load process
        console.error(`Unexpected error during ${currentEditMode ? 'update' : 'save'} operation:`, error);
        showNotification(`An unexpected error occurred. Please try again.`, "error");
    } finally {
        // Re-enable button regardless of success/failure
        isSaving = false;
        updateButtonStates();
    }
}


/** Optional: Clears the form fields within the creator modal */
function handleClearForm() {
    if (isSaving) return; // Don't clear while saving

    // Check if form is actually dirty (more complex check might be needed)
    const isDirty = gptNameInput?.value || gptDescriptionInput?.value || gptInstructionsInput?.value || currentEditingKnowledgeFiles.length > 0;

    if (!isDirty) {
        showNotification("Form is already clear.", "info");
        return;
    }

    if (confirm("Are you sure you want to clear the form? Any unsaved changes will be lost.")) {
        loadConfigIntoForm(null); // Clears form fields and knowledge list state
        // Reset mode to 'new' if cleared? Or keep edit mode but with blank fields?
        // Let's reset to 'new' mode for clarity if they clear while editing.
        if (currentEditMode) {
             currentEditMode = false;
             editingGptIdInput.value = '';
             if (creatorModalTitle) creatorModalTitle.textContent = "Create Custom GPT";
        }
        updateButtonStates(); // Update button text/state
        showNotification("Form cleared.", "success", 2000);
        gptNameInput?.focus();
    }
}

/**
 * Updates the enabled/disabled state and text of buttons based on form state and saving status.
 */
function updateButtonStates() {
    const formHasName = gptNameInput?.value.trim() !== '';
    const canSaveFolder = saveNewGptButton; // Check if the button exists

    if (canSaveFolder) {
        saveNewGptButton.disabled = !formHasName || isSaving;
        if (isSaving) {
            saveNewGptButton.textContent = currentEditMode ? "Updating..." : "Saving...";
            saveNewGptButton.classList.add('loading'); // Add a class for potential spinner styles
        } else {
            saveNewGptButton.textContent = currentEditMode ? "Update" : "Save";
            saveNewGptButton.classList.remove('loading');
        }
    }

    // Clear button state
    if (clearGptFormButton) {
        // Disable clear if saving, otherwise enable
        clearGptFormButton.disabled = isSaving;
    }

    // Upload button state (handled in renderKnowledgeFileList)
    renderKnowledgeFileList(); // Call this to ensure upload button state is also updated
}