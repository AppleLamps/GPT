// ===== FILE: js/components/chatInput.js =====
/**
 * Optimized Chat Input Component
 * Handles user input, file attachments, image uploads, and special modes
 */
import * as state from '../state.js';
import * as api from '../api.js';
import * as utils from '../utils.js';
import { 
    addUserMessage, 
    showChatInterface, 
    showTypingIndicator, 
    removeTypingIndicator, 
    createAIMessageContainer, 
    finalizeAIMessageContent, 
    setupMessageActions 
} from './messageList.js';
import { showNotification } from '../notificationHelper.js';
import { fetchDeepResearch } from '../geminiapi.js';
import { parseMarkdownString } from '../parser.js';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB limit
const ALLOWED_FILE_TYPES = ['text/plain', 'text/markdown', 'application/pdf'];
const MAX_FILES = 5; // Maximum number of allowed files
const TEXTAREA_MAX_HEIGHT = 200; // Maximum height for the input textarea

// Cache for DOM elements to avoid repeated queries
const elements = {
    // Elements will be populated during initialization
};

// Event handler debouncing
const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

// --- Voice Recognition ---
function startVoiceRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        showNotification("Voice recognition not supported in this browser.", "error");
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
        showNotification("Listening... Speak now.", "info");
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        showNotification(`Voice error: ${event.error}`, "error");
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessageInputValue(transcript);
    };

    recognition.start();
}

// --- File Handling ---
function triggerFileInput() {
    if (!elements.fileInput) return;
    
    const currentFiles = state.getAttachedFiles();
    if (currentFiles.length >= MAX_FILES) {
        showNotification(`You can attach a maximum of ${MAX_FILES} files.`, 'warning');
        return;
    }
    
    elements.fileInput.click();
}

async function handleFileSelection(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const currentFiles = state.getAttachedFiles();
    let filesAddedCount = 0;
    
    for (const file of files) {
        // Check file limit
        if (currentFiles.length + filesAddedCount >= MAX_FILES) {
            showNotification(`Maximum ${MAX_FILES} files allowed. Some files were not added.`, 'warning');
            break;
        }
        
        // Validate file type
        const fileTypeAllowed = ALLOWED_FILE_TYPES.includes(file.type) ||
            (file.type === '' && file.name.endsWith('.md'));
        if (!fileTypeAllowed) {
            showNotification(`File type not supported for "${file.name}". Allowed: TXT, MD, PDF.`, 'error');
            continue;
        }
        
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            showNotification(`File "${file.name}" exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB size limit.`, 'error');
            continue;
        }
        
        // Check for duplicates
        if (currentFiles.some(f => f.name === file.name)) {
            showNotification(`File "${file.name}" is already attached.`, 'warning');
            continue;
        }
        
        // Add file to state
        state.addAttachedFile({
            name: file.name,
            type: file.type,
            size: file.size
        });
        
        filesAddedCount++;
        renderFilePreviews(); // Update UI immediately
        utils.processAndStoreFile(file); // Process in background
    }
    
    // Clear file input for next selection
    if (elements.fileInput) {
        elements.fileInput.value = '';
    }
}

export function renderFilePreviews() {
    if (!elements.filePreview) return;
    
    const files = state.getAttachedFiles();
    elements.filePreview.innerHTML = '';
    
    files.forEach(file => {
        const extension = utils.getFileExtension(file.name);
        let iconClass = 'unknown';
        
        // Map extensions to CSS classes
        switch (extension) {
            case 'txt': iconClass = 'txt'; break;
            case 'pdf': iconClass = 'pdf'; break;
            case 'md': iconClass = 'md'; break;
        }
        
        const item = document.createElement('div');
        item.className = 'attached-file-pill';
        item.dataset.fileName = file.name;
        
        // Determine status display
        let statusHtml = '';
        if (file.processing) {
            statusHtml = `<span class="file-status">Processing...</span>`;
        } else if (file.error) {
            statusHtml = `<span class="file-error" title="${utils.escapeHTML(file.error)}">Error</span>`;
        }
        
        item.innerHTML = `
            <span class="file-icon ${iconClass}"></span>
            <span class="filename-text">${utils.escapeHTML(file.name)}</span>
            ${statusHtml}
            <button class="remove-file-button" title="Remove file">×</button>
        `;
        
        // Add event listener for remove button
        const removeBtn = item.querySelector('.remove-file-button');
        if (removeBtn) {
            removeBtn.addEventListener('click', handleRemoveFileClick);
        }
        
        elements.filePreview.appendChild(item);
    });
    
    // Update add button state if it exists
    if (elements.addButton) {
        elements.addButton.classList.toggle('has-files', files.length > 0);
        elements.addButton.disabled = files.length >= MAX_FILES;
        elements.addButton.title = files.length >= MAX_FILES ? 
            `Maximum ${MAX_FILES} files reached` : 
            `Add File (.txt, .md, .pdf)`;
    }
}

function handleRemoveFileClick(event) {
    const item = event.target.closest('.attached-file-pill');
    const fileName = item?.dataset.fileName;
    
    if (fileName) {
        state.removeAttachedFile(fileName);
        renderFilePreviews();
    }
}

// --- Textarea Handling ---
function adjustTextAreaHeight() {
    if (!elements.messageInput) return;
    
    elements.messageInput.style.height = 'auto';
    const scrollHeight = elements.messageInput.scrollHeight;
    elements.messageInput.style.height = Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT) + 'px';
    elements.messageInput.style.overflowY = scrollHeight < TEXTAREA_MAX_HEIGHT ? 'hidden' : 'auto';
}

// Debounced version for better performance during rapid typing
const debouncedAdjustHeight = debounce(adjustTextAreaHeight, 10);

export function clearMessageInput() {
    if (!elements.messageInput) return;
    
    elements.messageInput.value = '';
    adjustTextAreaHeight();
}

function getMessageInput() {
    return elements.messageInput?.value.trim() || '';
}

export function setMessageInputValue(text) {
    if (!elements.messageInput) return;
    
    elements.messageInput.value = text;
    adjustTextAreaHeight();
    elements.messageInput.focus();
}

// --- Mobile UI Handling ---
function toggleMobileOptions() {
    if (!elements.bottomToolbar || !elements.mobileOptionsToggle) return;
    
    elements.bottomToolbar.classList.toggle('mobile-visible');
    const isVisible = elements.bottomToolbar.classList.contains('mobile-visible');
    
    // Update button appearance
    elements.mobileOptionsToggle.innerHTML = isVisible
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` 
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    elements.mobileOptionsToggle.title = isVisible ? "Close options" : "More options";
}

function closeMobileOptions() {
    if (!elements.bottomToolbar || !elements.mobileOptionsToggle) return;
    
    if (elements.bottomToolbar.classList.contains('mobile-visible')) {
        elements.bottomToolbar.classList.remove('mobile-visible');
        // Reset button appearance
        elements.mobileOptionsToggle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
        elements.mobileOptionsToggle.title = "More options";
    }
}

// Handle clicks outside the mobile options menu
function handleOutsideClickForMobileOptions(event) {
    if (!elements.bottomToolbar || !elements.mobileOptionsToggle) return;
    
    if (!elements.bottomToolbar.classList.contains('mobile-visible')) return;
    
    // Check if clicked outside both the toggle button and toolbar
    const clickedOutside = !elements.mobileOptionsToggle.contains(event.target) && 
                           !elements.bottomToolbar.contains(event.target);
    
    if (clickedOutside) {
        closeMobileOptions();
    }
}

// --- Message Sending Logic ---
async function handleSendMessage() {
    // Check if we're in Deep Research Mode
    const isDeepResearchModeActive = state.getIsDeepResearchMode();

    if (isDeepResearchModeActive) {
        await handleDeepResearchSend();
    } else {
        await handleNormalMessageSend();
    }
}

async function handleDeepResearchSend() {
    const userTopic = getMessageInput();
    if (!userTopic) {
        showNotification("Please enter a topic for deep research.", 'warning');
        return;
    }

    const geminiApiKey = state.getGeminiApiKey();
    if (!geminiApiKey) {
        showNotification("Gemini API key not set.", 'error');
        state.setIsDeepResearchMode(false);
        if (elements.researchButton) {
            elements.researchButton.classList.remove('active');
        }
        updateInputUIForModel(state.getActiveCustomGptConfig());
        return;
    }

    // Add user's topic message to UI and history
    showChatInterface();
    addUserMessage(userTopic);
    state.addMessageToHistory({ role: 'user', content: userTopic });
    clearMessageInput();

    // Execute deep research
    const modelName = "gemini-2.5-pro-exp-03-25"; // Dedicated model for research
    await executeDeepResearch(geminiApiKey, modelName, userTopic);

    // Turn off deep research mode after completion
    state.setIsDeepResearchMode(false);
    if (elements.researchButton) {
        elements.researchButton.classList.remove('active');
    }
    updateInputUIForModel(state.getActiveCustomGptConfig());
}

async function handleNormalMessageSend() {
    const messageText = getMessageInput();
    const imageToSend = state.getCurrentImage();
    const files = state.getAttachedFiles();
    const selectedModelSetting = state.getSelectedModelSetting();
    const useWebSearch = state.getIsWebSearchEnabled();
    const isImageGenMode = state.getIsImageGenerationMode();
    const activeGpt = state.getActiveCustomGptConfig();
    
    // Validate input
    if (isImageGenMode) {
        if (!messageText) {
            showNotification("Please enter a prompt for image generation.", 'warning');
            return;
        }
    } else if (!messageText && !imageToSend && files.length === 0) {
        showNotification("Please enter a message or upload an image/file.", 'info');
        return;
    }

    // Validate API keys
    const effectiveModel = activeGpt ? 'gpt-4o' : selectedModelSetting;
    if (effectiveModel.startsWith('gemini-') && !state.getGeminiApiKey()) {
        showNotification("Gemini API key not set in Settings.", 'error');
        return;
    } else if (!effectiveModel.startsWith('gemini-') && !state.getApiKey()) {
        showNotification("OpenAI API key not set in Settings.", 'error');
        return;
    }

    // Check for files still processing
    const processingFiles = files.filter(f => f.processing);
    if (processingFiles.length > 0) {
        showNotification("Please wait for files to finish processing.", 'warning');
        return;
    }

    // Show chat interface
    showChatInterface();

    // Prepare message content with file data if present
    let fullMessage = messageText;
    if (files.length > 0) {
        const fileContents = files.map(file => file.content).filter(Boolean);
        if (fileContents.length > 0) {
            fullMessage = fileContents.join('\n\n') + '\n\n' + (messageText || 'Please analyze the provided content.');
        }
    }

    // Get file metadata for history
    const attachedFilesMeta = files.length > 0 ? 
        files.map(file => ({ name: file.name, type: file.type })) : 
        null;

    // Create and add user message
    const userMessage = {
        role: 'user',
        content: fullMessage,
        imageData: imageToSend?.data,
        attachedFilesMeta
    };

    state.addMessageToHistory(userMessage);
    addUserMessage(messageText, imageToSend?.data, attachedFilesMeta);

    // Clean up UI after sending
    clearMessageInput();
    cleanupAfterSend(imageToSend, files);

    // Call the API
    await api.routeApiCall(selectedModelSetting, useWebSearch);

    // Reset special modes
    resetSpecialModes(isImageGenMode, useWebSearch, effectiveModel);
}

function cleanupAfterSend(imageToSend, files) {
    // Clear image if present
    if (imageToSend) {
        removeImagePreview();
        state.clearCurrentImage();
    }
    
    // Clear files if present
    if (files.length > 0) {
        state.clearAttachedFiles();
        renderFilePreviews();
    }
    
    // Close mobile options if open
    closeMobileOptions();
}

function resetSpecialModes(isImageGenMode, useWebSearch, effectiveModel) {
    // Reset image generation mode if active
    if (isImageGenMode && elements.imageGenButton) {
        elements.imageGenButton.classList.remove('active');
        state.setImageGenerationMode(false);
    }
    
    // Reset web search mode if active for compatible models
    if (useWebSearch && effectiveModel === 'gpt-4o' && elements.searchButton) {
        elements.searchButton.classList.remove('active');
        state.setIsWebSearchEnabled(false);
    }
    
    // Update UI for current model state
    updateInputUIForModel(state.getActiveCustomGptConfig());
}

function handleMessageInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent newline
        handleSendMessage();
    }
}

// --- Image Handling ---
async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Validate image type
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        showNotification('Please upload a JPG or PNG image.', 'error');
        state.clearCurrentImage();
        removeImagePreview();
        return;
    }
    
    try {
        const base64Image = await utils.convertToBase64(file);
        
        state.setCurrentImage({ data: base64Image, name: file.name });
        showImagePreview(base64Image);
        showNotification('Image ready to send with your next message.', 'success', 2000);
        
        if (elements.messageInput) elements.messageInput.focus();
    } catch (error) {
        console.error("Error processing image:", error);
        showNotification('Error processing image.', 'error');
        state.clearCurrentImage();
        removeImagePreview();
    } finally {
        if (elements.imageInput) elements.imageInput.value = '';
    }
}

function handleRemoveImageClick() {
    state.clearCurrentImage();
    removeImagePreview();
}

function showImagePreview(base64Image) {
    if (!elements.imagePreview) return;
    
    elements.imagePreview.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${base64Image}" alt="Preview">
            <button class="remove-image" id="removeImageBtnInternal" title="Remove image">×</button>
        </div>
    `;
    
    const removeBtn = document.getElementById('removeImageBtnInternal');
    removeBtn?.addEventListener('click', handleRemoveImageClick);
}

export function removeImagePreview() {
    if (!elements.imagePreview) return;
    
    elements.imagePreview.innerHTML = '';
    
    if (elements.imageInput) {
        elements.imageInput.value = '';
    }
}

export function renderImagePreview() {
    const currentImage = state.getCurrentImage();
    if (currentImage && currentImage.data) {
        showImagePreview(currentImage.data);
    } else {
        removeImagePreview();
    }
}

// --- Toolbar Actions ---
function handleSearchToggle() {
    if (!elements.searchButton) return;
    
    const activeGpt = state.getActiveCustomGptConfig();
    const effectiveModel = activeGpt ? 'gpt-4o' : state.getSelectedModelSetting();
    
    if (effectiveModel === 'gpt-4o' || 
        effectiveModel === 'gpt-4.1' ||
        effectiveModel === 'gpt-4.5-preview') {
        const isActive = state.toggleWebSearch();
        elements.searchButton.classList.toggle('active', isActive);
        showNotification(`Web search for next message: ${isActive ? 'ON' : 'OFF'}`, 'info', 1500);
    } else {
        elements.searchButton.classList.remove('active');
        state.setIsWebSearchEnabled(false);
        showNotification("Web search requires GPT-4o, GPT-4.1, or GPT-4.5.", 'warning');
    }
}

function handleImageGenToggle() {
    const newState = !state.getIsImageGenerationMode();
    state.setImageGenerationMode(newState);
    
    if (elements.imageGenButton) {
        elements.imageGenButton.classList.toggle('active', newState);
    }
    
    showNotification(`Image Generation Mode: ${newState ? 'ON' : 'OFF'}`, 'info', 1500);
    
    if (elements.messageInput) {
        elements.messageInput.placeholder = newState ? 
            "Enter a prompt to generate an image..." : 
            "Message ChatGPT";
    }
}

function handleDeepResearchClick(event) {
    event.preventDefault();

    const geminiApiKey = state.getGeminiApiKey();
    if (!geminiApiKey) {
        showNotification("Please set your Gemini API key in Settings to use Deep Research.", 'error');
        
        if (state.getIsDeepResearchMode()) {
            state.setIsDeepResearchMode(false);
            if (elements.researchButton) {
                elements.researchButton.classList.remove('active');
            }
            updateInputUIForModel(state.getActiveCustomGptConfig());
        }
        return;
    }

    const newState = !state.getIsDeepResearchMode();
    state.setIsDeepResearchMode(newState);

    if (elements.researchButton) {
        elements.researchButton.classList.toggle('active', newState);
    }

    updateInputUIForModel(state.getActiveCustomGptConfig());
    showNotification(`Deep Research Mode: ${newState ? 'ON' : 'OFF'}. Enter topic and press Send.`, 'info', 2500);
    
    if (elements.messageInput) {
        elements.messageInput.focus();
    }
}

function handleNotImplemented(event) {
    const button = event.target.closest('button');
    if (!button) return;
    
    const handledElsewhere = [
        'sendButton', 'imageButton', 'addButton', 
        'searchButton', 'imageGenButton', 'mobileOptionsToggleBtn'
    ];
    
    if (handledElsewhere.includes(button.id)) return;
    
    const buttonText = button.title || 
                      button.textContent?.trim().split('\n')[0] || 
                      button.id || 
                      'Button';
    
    showNotification(`${buttonText} functionality not yet implemented.`, 'info');
}

// --- Deep Research Implementation ---
async function executeDeepResearch(geminiApiKey, modelName, userTopic) {
    const RESEARCH_PROMPT = `
Act as an expert researcher and analyst. Your task is to generate a **highly detailed, comprehensive, and well-structured analytical report** based *on the following topic provided by the user*:

**User Topic:** "${userTopic}"

**Overall Goal:** Generate an in-depth report that aims to **significantly exceed 3,000 words**. Focus on depth, rigorous analysis, synthesis of information, exploration of different facets, providing context, and maintaining a clear, coherent structure. Use your internal knowledge base extensively to elaborate on the topic.

**Report Structure (Mandatory JSON Keys):**

Your JSON response MUST contain keys exactly matching the following structure. Populate each key with **extensive, detailed text** as described below:

1.  **Report_Title:** Generate a fitting and descriptive title for this report based on the user's topic.
2.  **Introduction_Scope:** (String: Target 400-600 words) Provide a comprehensive introduction to the user's topic. Define the scope of the report, outline the key areas that will be covered, and state the report's main objectives or the questions it aims to explore. Establish the significance of the topic.
3.  **Historical_Context_Background:** (String: Target 400-700 words) Explore the relevant historical context and background leading up to the current state of the topic. Discuss key developments, foundational concepts, or preceding events necessary to understand the topic fully. If history isn't directly applicable, discuss the foundational principles or context.
4.  **Key_Concepts_Definitions:** (String: Target 400-600 words) Define and explain the core concepts, terminology, and fundamental principles related to the user's topic in detail. Ensure clarity and provide examples where appropriate.
5.  **Main_Analysis_Exploration:** (String: Target 1200-1800+ words) This is the **central and most substantial section**. Break down the user's topic into 3-6 significant sub-themes or key areas of analysis. For **EACH** sub-theme:
    * Clearly introduce the sub-theme.
    * Provide a **deep and detailed exploration** covering relevant aspects, arguments, evidence, examples, case studies, mechanisms, processes, etc.
    * Analyze nuances, complexities, relationships between different elements, and different perspectives related to the sub-theme.
    * Structure this section logically. Use paragraphs effectively. **Substantial elaboration here is critical to meet the overall length goal.**
6.  **Current_State_Applications:** (String: Target 400-600 words) Discuss the current status, relevance, applications, or manifestations of the topic in the real world or relevant fields. Provide specific examples if possible.
7.  **Challenges_Perspectives_Criticisms:** (String: Target 400-600 words) Explore the challenges, limitations, criticisms, controversies, or differing perspectives associated with the topic. Provide a balanced view by discussing potential drawbacks or points of contention.
8.  **Future_Outlook_Trends:** (String: Target 300-500 words) Discuss potential future developments, emerging trends, future research directions, or the long-term outlook related to the topic.
9.  **Conclusion:** (String: Target 300-500 words) Provide a strong concluding section that synthesizes the key points discussed throughout the report. Reiterate the significance of the topic and offer final thoughts or takeaways. Do not introduce new information here.

**Output Instructions:**
- The FINAL output MUST be ONLY the single, valid JSON object described above. No introductory text, explanations, or markdown formatting outside the JSON string values.
- Ensure all string values are properly escaped within the JSON structure. Use newline characters (\`\\n\`) appropriately within the text values for paragraph breaks where needed for readability within the final document, but ensure the overall output is valid JSON.
- For all text sections (2 through 9), provide extensive, well-structured prose. Generate substantial, detailed content for each to collectively exceed the 3,000-word target.
- Leverage your internal knowledge base thoroughly to provide depth and breadth on the **User Topic**.

Generate the JSON output now.
`;

    showTypingIndicator("Generating deep research report (this may take several minutes)...");

    try {
        const reportData = await fetchDeepResearch(geminiApiKey, modelName, RESEARCH_PROMPT);

        if (reportData && typeof reportData === 'object') {
            const aiMessageElement = createAIMessageContainer();
            if (aiMessageElement) {
                // Build HTML content from report data
                let finalHtml = '';
                let combinedRawText = '';

                const sectionMap = {
                    "Report_Title": "Report Title",
                    "Introduction_Scope": "Introduction and Scope",
                    "Historical_Context_Background": "Historical Context and Background",
                    "Key_Concepts_Definitions": "Key Concepts and Definitions",
                    "Main_Analysis_Exploration": "Main Analysis and Exploration",
                    "Current_State_Applications": "Current State and Applications",
                    "Challenges_Perspectives_Criticisms": "Challenges, Perspectives, and Criticisms",
                    "Future_Outlook_Trends": "Future Outlook and Trends",
                    "Conclusion": "Conclusion"
                };

                // Add title
                const reportTitle = reportData['Report_Title'] || 'Deep Research Report';
                finalHtml += `<h2>${utils.escapeHTML(reportTitle)}</h2><br>`;
                combinedRawText += `${reportTitle}\n\n`;

                // Add sections
                for (const key in sectionMap) {
                    if (reportData[key] && reportData[key].trim()) {
                        const headingText = sectionMap[key];
                        const sectionRawContent = reportData[key];
                        const sectionHtmlContent = parseMarkdownString(sectionRawContent);

                        finalHtml += `<h3>${utils.escapeHTML(headingText)}</h3>${sectionHtmlContent}<br>`;
                        combinedRawText += `--- ${headingText} ---\n${sectionRawContent}\n\n`;
                    }
                }

                // Display content
                finalizeAIMessageContent(aiMessageElement, finalHtml);
                state.addMessageToHistory({ role: "model", content: combinedRawText.trim() });
                setupMessageActions(aiMessageElement, combinedRawText.trim());
            } else {
                console.error("Failed to create AI message container for deep research result.");
                showNotification("Failed to display deep research result.", "error");
            }
        } else {
            console.error("Deep research returned invalid data:", reportData);
            showNotification("Deep research failed to generate valid data.", "error");
        }
    } catch (error) {
        console.error("Error in executeDeepResearch:", error);
        showNotification(`Error during deep research: ${error.message}`, 'error');
    } finally {
        removeTypingIndicator();
    }
}

// --- UI Updates ---
export function updateInputUIForModel(activeGpt) {
    const isDeepResearchModeActive = state.getIsDeepResearchMode();
    
    // Determine effective model based on mode and configuration
    let effectiveModel = 'gemini-2.5-pro-exp-03-25'; // Default for research mode
    
    if (!isDeepResearchModeActive) {
        effectiveModel = activeGpt?.model || state.getSelectedModelSetting();
    }
    
    // Model type flags for feature availability
    const isGemini = effectiveModel.startsWith('gemini-');
    const isAdvancedModel = 
        effectiveModel === 'gpt-4o' || 
        effectiveModel === 'gpt-4.1' || 
        effectiveModel === 'gpt-4.5-preview';

    // Update placeholder text based on mode
    if (elements.messageInput) {
        if (isDeepResearchModeActive) {
            elements.messageInput.placeholder = "Enter topic for Deep Research and press Send...";
        } else if (state.getIsImageGenerationMode() && isAdvancedModel) {
             elements.messageInput.placeholder = "Enter a prompt to generate an image...";
        } else {
            const modelName = isGemini ? "Gemini" : 
                            (isAdvancedModel ? "ChatGPT" : "Model");
            elements.messageInput.placeholder = `Message ${modelName}`;
        }
    }

    // Update feature buttons based on compatibility
    updateFeatureButtons(isDeepResearchModeActive, isAdvancedModel, isGemini);
}

function updateFeatureButtons(isDeepResearchMode, isAdvancedModel, isGemini) {
    // Web Search button
    if (elements.searchButton) {
        const canUseWebSearch = !isDeepResearchMode && isAdvancedModel;
        elements.searchButton.disabled = !canUseWebSearch;
        elements.searchButton.title = canUseWebSearch ? 
            "Toggle Web Search" : 
            (isDeepResearchMode ? "Web Search disabled in Deep Research mode" : 
                                "Web Search only available for advanced models");
        
        // Update active state
        if (!canUseWebSearch) {
            elements.searchButton.classList.remove('active');
            if (state.getIsWebSearchEnabled()) state.setIsWebSearchEnabled(false);
        } else {
            elements.searchButton.classList.toggle('active', state.getIsWebSearchEnabled());
        }
    }

    // Image Generation button
    if (elements.imageGenButton) {
        const canUseImageGen = !isDeepResearchMode && isAdvancedModel;
        elements.imageGenButton.disabled = !canUseImageGen;
        elements.imageGenButton.title = canUseImageGen ? 
            "Toggle Image Generation Mode" : 
            (isDeepResearchMode ? "Image Generation disabled in Deep Research mode" : 
                                "Image Generation requires advanced models");
        
        // Update active state
        if (!canUseImageGen) {
            elements.imageGenButton.classList.remove('active');
            if (state.getIsImageGenerationMode()) state.setImageGenerationMode(false);
        } else {
            elements.imageGenButton.classList.toggle('active', state.getIsImageGenerationMode());
        }
    }

    // Image Upload button
    if (elements.imageButton) {
        const supportsImageInput = !isDeepResearchMode && (isGemini || isAdvancedModel);
        elements.imageButton.disabled = !supportsImageInput;
        elements.imageButton.title = supportsImageInput ? 
            "Upload image" : 
            (isDeepResearchMode ? "Image Upload disabled in Deep Research mode" : 
                                "Image upload requires compatible model");
        
        // Remove preview if disabled
        if (!supportsImageInput && state.getCurrentImage()) {
            showNotification("Image removed as it's not supported in this mode.", 'warning');
            state.clearCurrentImage();
            removeImagePreview();
        }
    }

    // File Upload button
    if (elements.addButton) {
        const files = state.getAttachedFiles();
        elements.addButton.disabled = isDeepResearchMode || files.length >= MAX_FILES;
        elements.addButton.title = isDeepResearchMode ? 
            "File Upload disabled in Deep Research mode" : 
            (files.length >= MAX_FILES ? `Maximum ${MAX_FILES} files reached` : 
                                      `Add File (.txt, .md, .pdf)`);
        
        // Remove files if disabled
        if (isDeepResearchMode && files.length > 0) {
            showNotification("Files removed as they are not supported in Deep Research mode.", 'warning');
            state.clearAttachedFiles();
            renderFilePreviews();
        }
    }

    // Deep Research button
    if (elements.researchButton) {
        const geminiApiKey = state.getGeminiApiKey();
        elements.researchButton.disabled = !geminiApiKey;
        elements.researchButton.title = geminiApiKey ? 
            "Toggle Deep Research Mode (Gemini)" : 
            "Set Gemini API key in Settings to enable Deep Research";
        
        // Force mode off if key is missing
        if (!geminiApiKey && state.getIsDeepResearchMode()) {
            state.setIsDeepResearchMode(false);
        }
        
        // Update active state
        elements.researchButton.classList.toggle('active', state.getIsDeepResearchMode() && geminiApiKey);
    }
}

// --- Layout Management ---
function setupDynamicLayoutHandling() {
    const inputContainer = document.querySelector('.input-container');
    if (!inputContainer) return;
    
    // Create a ResizeObserver to monitor input container size changes
    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            // Get the height including padding and border
            const height = entry.borderBoxSize?.[0]?.blockSize || 
                          entry.contentRect.height;
            
            if (height > 0) {
                document.documentElement.style.setProperty(
                    '--dynamic-input-area-height', 
                    `${height}px`
                );
            }
        }
    });
    
    // Start observing the input container
    resizeObserver.observe(inputContainer);
    
    // Set initial height
    const initialHeight = inputContainer.getBoundingClientRect().height;
    if (initialHeight > 0) {
        document.documentElement.style.setProperty(
            '--dynamic-input-area-height', 
            `${initialHeight}px`
        );
    }
    
    // Store observer for potential cleanup later
    return resizeObserver;
}

// --- Initialization ---
export function initializeChatInput() {
    console.log("Initializing Chat Input components...");
    
    // Cache all DOM elements for better performance
    elements.messageInput = document.getElementById('messageInput');
    elements.sendButton = document.getElementById('sendButton');
    elements.imagePreview = document.getElementById('imagePreview');
    elements.imageInput = document.getElementById('imageInput');
    elements.imageButton = document.getElementById('imageButton');
    elements.filePreview = document.getElementById('filePreview');
    elements.fileInput = document.getElementById('fileInput');
    elements.addButton = document.getElementById('addButton');
    elements.searchButton = document.getElementById('searchButton');
    elements.researchButton = document.getElementById('researchButton');
    elements.voiceButton = document.getElementById('voiceButton');
    elements.imageGenButton = document.getElementById('imageGenButton');
    elements.mobileOptionsToggle = document.getElementById('mobileOptionsToggleBtn');
    elements.bottomToolbar = document.querySelector('.input-container .bottom-toolbar');
    
    // Set up text input handlers
    if (elements.messageInput) {
        elements.messageInput.addEventListener('input', debouncedAdjustHeight);
        elements.messageInput.addEventListener('keydown', handleMessageInputKeydown);
    }
    
    // Set up send button
    if (elements.sendButton) {
        elements.sendButton.addEventListener('click', handleSendMessage);
    }
    
    // Set up image upload
    if (elements.imageButton && elements.imageInput) {
        elements.imageButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.imageInput?.click();
            closeMobileOptions();
        });
        
        elements.imageInput.addEventListener('change', handleImageUpload);
    }
    
    // Set up file upload
    if (elements.addButton && elements.fileInput) {
        elements.addButton.addEventListener('click', () => {
            triggerFileInput();
            closeMobileOptions();
        });
        elements.fileInput.addEventListener('change', handleFileSelection);
    }
    
    // Set up mobile options toggle
    if (elements.mobileOptionsToggle) {
        elements.mobileOptionsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileOptions();
        });
    }
    
    // Set up document listener for mobile options
    if (!document.hasMobileOutsideClickListener) {
        document.addEventListener('click', handleOutsideClickForMobileOptions);
        document.hasMobileOutsideClickListener = true;
    }
    
    // Set up toolbar buttons
    if (elements.searchButton) {
        elements.searchButton.addEventListener('click', () => {
            handleSearchToggle();
            closeMobileOptions();
        });
    }
    
    if (elements.researchButton) {
        elements.researchButton.addEventListener('click', (e) => {
            handleDeepResearchClick(e);
            closeMobileOptions();
        });
    }
    
    if (elements.voiceButton) {
        elements.voiceButton.addEventListener('click', () => {
            startVoiceRecognition();
            closeMobileOptions();
        });
    }
    
    if (elements.imageGenButton) {
        elements.imageGenButton.addEventListener('click', () => {
            handleImageGenToggle();
            closeMobileOptions();
        });
    }
    
    // Make sure all toolbar buttons close the popup
    document.querySelectorAll('.bottom-toolbar .tool-button').forEach(button => {
        button.addEventListener('click', closeMobileOptions);
    });
    
    // Set up dynamic layout handling
    setupDynamicLayoutHandling();
    
    // Initialize UI state
    adjustTextAreaHeight();
    renderFilePreviews();
    renderImagePreview();
    updateInputUIForModel(state.getActiveCustomGptConfig());
    
    console.log("Chat Input initialization complete.");
}
