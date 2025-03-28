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
let currentEditingKnowledgeFiles = [];
let currentEditMode = false; // Track if the modal is for creating or editing

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
    if (!gptCreatorModal) return;

    currentEditMode = !!configData; // Set mode based on whether configData exists

    if (currentEditMode) {
        console.log(`Opening creator modal in EDIT mode for: ${configData.name}`);
        if (creatorModalTitle) creatorModalTitle.textContent = "Edit Custom GPT";
        loadConfigIntoForm(configData);
        editingGptIdInput.value = configData.id || ''; // Store ID
        // Show Update button, hide Save? Or just change text of one button?
        // Let's keep one 'Save' button and handle logic internally for simplicity
        // if(saveNewGptButton) saveNewGptButton.textContent = "Update";
        if (saveNewGptButton) saveNewGptButton.style.display = 'inline-block'; // Ensure Save/Update button is visible
        if (updateGptButton) updateGptButton.style.display = 'none'; // Hide separate update button if exists

    } else {
        console.log("Opening creator modal in NEW mode.");
        if (creatorModalTitle) creatorModalTitle.textContent = "Create Custom GPT";
        loadConfigIntoForm(null); // Clear the form
        editingGptIdInput.value = ''; // Clear ID
        // Ensure Save button is visible and text is correct
        if (saveNewGptButton) saveNewGptButton.textContent = "Save";
        if (saveNewGptButton) saveNewGptButton.style.display = 'inline-block';
        if (updateGptButton) updateGptButton.style.display = 'none';
    }

    updateButtonStates(); // Set initial button states
    gptCreatorModal.classList.add('visible');
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
    console.log("Creator modal closed.");
}

/**
 * Loads data from a configuration object into the form fields.
 * @param {object | null} config The configuration object to load, or null to clear.
 */
function loadConfigIntoForm(config) {
    // Ensure elements exist (redundant check, but safe)
    if (!gptNameInput || !gptInstructionsInput || !capWebSearchCheckbox || !capImageGenCheckbox || !knowledgeFileListContainer) return;

    if (config) {
        gptNameInput.value = config.name || '';
        gptDescriptionInput.value = config.description || '';
        gptInstructionsInput.value = config.instructions || '';
        capWebSearchCheckbox.checked = config.capabilities?.webSearch || false;
        capImageGenCheckbox.checked = config.capabilities?.imageGeneration || false;
        // Load other capabilities...

        // Load knowledge files (store a *copy* for editing)
        currentEditingKnowledgeFiles = config.knowledgeFiles ? config.knowledgeFiles.map(f => ({ ...f })) : [];

    } else {
        // Clear the form
        gptNameInput.value = '';
        gptDescriptionInput.value = '';
        gptInstructionsInput.value = '';
        capWebSearchCheckbox.checked = false;
        capImageGenCheckbox.checked = false;
        // Clear other capabilities...
        currentEditingKnowledgeFiles = []; // Clear knowledge files list
    }
    // Render the knowledge file list for the loaded/cleared config
    renderKnowledgeFileList();
}

/**
 * Reads the current values from the form fields into a config object structure.
 * Includes ID if in edit mode.
 * @returns {object} A configuration object based on form values.
 */
function getConfigFromForm() {
    const config = {
        // Include ID only if we are updating an existing one
        id: currentEditMode ? editingGptIdInput.value : undefined,
        name: gptNameInput?.value.trim() || '',
        description: gptDescriptionInput?.value.trim() || '',
        instructions: gptInstructionsInput?.value.trim() || '',
        capabilities: {
            webSearch: capWebSearchCheckbox?.checked || false,
            imageGeneration: capImageGenCheckbox?.checked || false,
            // Add other capabilities here...
        },
        // Use the current state of the files being edited
        knowledgeFiles: currentEditingKnowledgeFiles.map(f => ({ ...f })) // Store a copy
    };
    // Remove id property if it's undefined (for creating new)
    if (config.id === undefined) {
        delete config.id;
    }
    return config;
}


/**
 * Renders the list of knowledge files currently being edited in the modal.
 */
function renderKnowledgeFileList() {
    if (!knowledgeFileListContainer) return;
    knowledgeFileListContainer.innerHTML = ''; // Clear list

    if (currentEditingKnowledgeFiles.length === 0) {
        knowledgeFileListContainer.innerHTML = '<p class="no-files-note">No knowledge files attached.</p>';
    } else {
        currentEditingKnowledgeFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'knowledge-file-item';
            const displayError = file.error ? `<span class="file-error" title="${escapeHTML(file.error)}">Error</span>` : '';
            const displayName = escapeHTML(file.name);

            item.innerHTML = `
                <span class="file-name">${displayName}</span>
                ${displayError}
                <button class="remove-knowledge-file" data-index="${index}" title="Remove file">×</button>
            `;
            knowledgeFileListContainer.appendChild(item);
        });
    }

    // Update upload button state
    if (knowledgeUploadButton) {
        const limitReached = currentEditingKnowledgeFiles.length >= MAX_KNOWLEDGE_FILES_PER_CONFIG;
        knowledgeUploadButton.disabled = limitReached;
        knowledgeUploadButton.title = limitReached
            ? `Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} knowledge files reached`
            : 'Upload Knowledge Files (.txt, .md, .pdf)';
    }
}

/**
 * Handles removing a knowledge file from the `currentEditingKnowledgeFiles` list (in the modal).
 * @param {Event} event Click event from a remove button.
 */
function handleRemoveKnowledgeFile(event) {
    const indexToRemove = parseInt(event.target.dataset.index, 10);
    if (!isNaN(indexToRemove) && indexToRemove >= 0 && indexToRemove < currentEditingKnowledgeFiles.length) {
        const removedFile = currentEditingKnowledgeFiles.splice(indexToRemove, 1);
        console.log(`Removed knowledge file "${removedFile[0]?.name}" from modal edit list.`);
        renderKnowledgeFileList(); // Update UI
        updateButtonStates(); // Update save button state if needed
    }
}


/**
 * Callback function after knowledge files have been processed by knowledgeHandler.
 * Updates the `currentEditingKnowledgeFiles` list in the modal.
 * @param {Array} results Array of processed file results {name, type?, content?, error?}.
 */
function onKnowledgeFilesProcessed(results) {
    let filesAdded = 0;
    let filesErrored = 0;
    let spaceIssue = false;

    results.forEach(result => {
        if (currentEditingKnowledgeFiles.length >= MAX_KNOWLEDGE_FILES_PER_CONFIG) {
            if (!spaceIssue) { // Only log/notify once per batch
                console.log("Max files reached during processing callback, discarding further results.");
                showNotification(`Maximum ${MAX_KNOWLEDGE_FILES_PER_CONFIG} files allowed. Some uploads were ignored.`, 'warning');
                spaceIssue = true;
            }
            return; // Stop adding if max is reached
        }

        // Check if already exists (double check)
        if (currentEditingKnowledgeFiles.some(f => f.name === result.name)) {
            console.warn(`Knowledge file "${result.name}" already exists in list, skipping add.`);
            return;
        }

        if (result.error) {
            filesErrored++;
            // Add the file with error info to the list so user sees it failed
            currentEditingKnowledgeFiles.push({ name: result.name, error: result.error, content: null });
            showNotification(`Error processing "${result.name}": ${result.error}`, 'error', 5000);
        } else if (result.content !== undefined) {
            filesAdded++;
            // Add the successfully processed file
            currentEditingKnowledgeFiles.push({
                name: result.name,
                type: result.type || 'unknown', // Add type if available
                content: result.content,
                error: null
            });
        }
    });

    if (filesAdded > 0) {
        console.log(`${filesAdded} knowledge file(s) processed and added to modal edit list.`);
    }
    if (filesErrored > 0) {
        console.warn(`${filesErrored} knowledge file(s) had processing errors.`);
    }

    renderKnowledgeFileList(); // Update UI list
    updateButtonStates(); // Enable save buttons etc.
}


// --- Button Actions ---

/**
 * Handles the unified "Save" / "Update" button click.
 */
function handleSaveOrUpdateGpt() {
    const config = getConfigFromForm(); // Gets data, includes ID if in edit mode

    if (!config.name) {
        showNotification("Please enter a name for the Custom GPT.", "warning");
        gptNameInput?.focus();
        return;
    }

    // gptStore.saveConfig handles create vs update based on presence of config.id
    const savedMeta = gptStore.saveConfig(config);

    if (savedMeta) {
        const action = currentEditMode ? "updated" : "saved";
        showNotification(`Custom GPT "${savedMeta.name}" ${action}.`, "success");

        // Reload the full config to ensure we have the ID and potentially cleaned data
        const fullConfig = gptStore.loadConfig(savedMeta.id);
        if (fullConfig) {
            // If the saved/updated GPT was the one being created/edited,
            // make it the active one.
            state.setActiveCustomGptConfig(fullConfig); // Make it active
            updateActiveGptDisplay(); // Update header
            // Maybe clear chat history here?
        }

        closeCreatorModal(); // Close modal on success
        renderCustomGptList(); // Update sidebar list

    } else {
        // saveConfig shows error notification on failure
        console.error(`Failed to ${currentEditMode ? 'update' : 'save'} config.`);
        // Keep modal open for user to fix potential issues (like size limit)
    }
}


/** Optional: Clears the form fields within the creator modal */
function handleClearForm() {
    if (confirm("Are you sure you want to clear the form? Any unsaved changes will be lost.")) {
        loadConfigIntoForm(null); // Clears form fields and knowledge list
        // If in edit mode, maybe revert to create mode? Or just clear? Let's just clear.
        updateButtonStates();
    }
}

/**
 * Updates the enabled/disabled state of buttons based on form state.
 */
function updateButtonStates() {
    const formHasName = gptNameInput?.value.trim() !== '';

    // Unified Save/Update button logic
    if (saveNewGptButton) {
        saveNewGptButton.disabled = !formHasName;
        saveNewGptButton.textContent = currentEditMode ? "Update" : "Save";
    }

    // If using separate buttons:
    // if (saveNewGptButton) saveNewGptButton.disabled = !formHasName || currentEditMode;
    // if (updateGptButton) updateGptButton.disabled = !formHasName || !currentEditMode;

    // Clear button always enabled if present
    // if (clearGptFormButton) clearGptFormButton.disabled = false;
}