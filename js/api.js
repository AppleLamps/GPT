// ===== FILE: js/api.js =====
// MODIFIED: Use accumulateChunkAndGetEscaped during stream, parseFinalHtml at the end.
// MODIFIED: Corrected image payload structure for /v1/responses API based on documentation and errors.
// FIXED: buildResponsesApiInput now reads image data from the history entry passed to it.
// MODIFIED: fetchGrokCompletions now streams reasoning content live.
import * as state from './state.js';
// Use new functions from messageList for appending/finalizing
import { showTypingIndicator, removeTypingIndicator, createAIMessageContainer, appendAIMessageContent, finalizeAIMessageContent, setupMessageActions, showChatInterface } from './components/messageList.js';
import { showNotification } from './notificationHelper.js';
// Use new functions from parser
import { resetParser, accumulateChunkAndGetEscaped, parseFinalHtml, getAccumulatedRawText } from './parser.js';
import { escapeHTML } from './utils.js';
// Import Gemini API functions
import { fetchGeminiStream, buildGeminiPayloadContents, buildGeminiSystemInstruction, buildGeminiGenerationConfig } from './geminiapi.js';
// Import the new rendering function
import { renderImprovedWebSearchResults } from './components/webSearch.js';
// Import Supabase client
import { supabase } from './supabaseClient.js';
// Import marked for Grok reasoning parsing
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";


// API Endpoints
const CHAT_COMPLETIONS_API_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const TTS_API_URL = 'https://api.openai.com/v1/audio/speech';
const IMAGE_GENERATION_API_URL = 'https://api.openai.com/v1/images/generations';
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

// Initialize OpenAI client - NO LONGER NEEDED HERE FOR IMAGE GEN
/*
function getOpenAIClient() {
    const apiKey = state.getApiKey();
    if (!apiKey) return null;
    return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}
*/

// --- API Routing ---

/**
 * Main function to decide which API endpoint to call based on model and features.
 * Incorporates active Custom GPT configuration.
 * @param {string} selectedModelSetting - The *default* model setting chosen by the user.
 * @param {boolean} useWebSearch - Whether web search was toggled ON for this message.
 */
export async function routeApiCall(selectedModelSetting, useWebSearch) {
    // Early validation of history and last user message
    const history = state.getChatHistory();
    const lastUserMessageEntry = history.filter(m => m.role === 'user').pop();
    
    if (!history.length || !lastUserMessageEntry) {
        console.error("Cannot call API: No user message history found.");
        showNotification("Please type a message or upload an image first.", 'info');
        return;
    }
    
    // --- Determine effective settings based on configuration ---
    const activeConfig = state.getActiveCustomGptConfig();
    const isImageGenMode = state.getIsImageGenerationMode();
    
    // Initialize settings with defaults
    const settings = {
        model: selectedModelSetting,
        systemPrompt: null,
        knowledgeContent: "",
        capabilities: { webSearch: useWebSearch }
    };

    // Apply custom GPT settings if available
    if (activeConfig) {
        console.log(`Using Custom GPT Config: "${activeConfig.name}"`);
        settings.systemPrompt = activeConfig.instructions || null;

        // Process knowledge files if they exist
        if (activeConfig.knowledgeFiles?.length > 0) {
            const validFiles = activeConfig.knowledgeFiles.filter(kf => kf.content && !kf.error);
            if (validFiles.length > 0) {
                settings.knowledgeContent = validFiles
                    .map(kf => `--- START Knowledge: ${kf.name} ---\n${kf.content}\n--- END Knowledge: ${kf.name} ---`)
                    .join('\n\n');
                console.log(`Injecting content from ${validFiles.length} knowledge file(s).`);
            }
        }

        // Get web search capability from config if defined
        if (activeConfig.capabilities?.webSearch !== undefined) {
            settings.capabilities.webSearch = activeConfig.capabilities.webSearch;
            console.log(`Web search capability from config: ${settings.capabilities.webSearch}`);
        }

        // Force gpt-4o if config uses features not compatible with o3-mini
        if (settings.model === 'o3-mini-high' && 
            (lastUserMessageEntry?.imageData || 
             settings.capabilities.webSearch || 
             settings.knowledgeContent || 
             settings.systemPrompt)) {
            console.warn(`Custom GPT "${activeConfig.name}" uses features requiring gpt-4o. Upgrading model.`);
            settings.model = 'gpt-4o';
        }
    } else {
        console.log("Using default chat behavior (no Custom GPT active).");
    }

    // Ensure web search is only used with compatible models
    if (settings.model !== 'gpt-4o' && 
        settings.model !== 'gpt-4o-latest' &&
        settings.model !== 'gpt-4.5-preview' && 
        settings.model !== 'gpt-4.1') {
        settings.capabilities.webSearch = false;
    }

    // Validate effective input
    const lastUserMessageContent = lastUserMessageEntry.content || "";
    const effectiveInputExists = lastUserMessageContent || 
                                lastUserMessageEntry.imageData || 
                                settings.knowledgeContent || 
                                settings.systemPrompt;

    if (!effectiveInputExists) {
        console.error("Cannot call API: No effective user input.");
        showNotification("Please type a message, upload an image, or ensure your Custom GPT provides context.", 'info');
        return;
    }

    // --- ROUTE TO APPROPRIATE API ENDPOINT ---
    
    // Image generation gets priority if that mode is active
    if (isImageGenMode) {
        await handleImageGeneration(lastUserMessageContent);
        return;
    }
    
    // Route based on model type
    const isGeminiModel = settings.model.startsWith('gemini-');
    const isGrokModel = settings.model.startsWith('grok-');
    
    if (isGrokModel) {
        await handleGrokCompletion(settings, history, lastUserMessageEntry);
    } else if (isGeminiModel) {
        await handleGeminiCompletion(settings, history, lastUserMessageEntry);
    } else if (settings.model === 'o3-mini-high') {
        await handleO3MiniCompletion(settings, history, lastUserMessageEntry);
    } else if (settings.model === 'o4-mini') {
        await handleO4MiniCompletion(settings, history, lastUserMessageEntry);
    } else if (settings.model === 'gpt-4o' || 
               settings.model === 'gpt-4.1' || 
               settings.model === 'gpt-4.5-preview') {
        await handleGPT4Completion(settings, history, lastUserMessageEntry);
    } else {
        console.error(`Model "${settings.model}" routing not implemented.`);
        showNotification(`Model "${settings.model}" is not supported.`, 'error');
    }
}

/**
 * Handle image generation via Supabase Edge Function
 * @param {string} prompt - The user prompt for image generation
 */
async function handleImageGeneration(prompt) {
    console.log(`Routing to Supabase Edge Function 'generate-image'`);
    
    if (!supabase) {
        console.error("Supabase client is not available. Cannot call Edge Function.");
        showNotification("Error: Supabase client not initialized. Cannot generate image.", 'error');
        return;
    }

    // Clear previous image URL state
    state.clearLastGeneratedImageUrl();
    
    // Create message container with placeholder styling
    const aiMessageElement = createAIMessageContainer();
    if (!aiMessageElement) {
        console.error("Failed to create AI message container for placeholder.");
        showNotification("Error displaying image placeholder.", 'error');
        return;
    }

    // Add placeholder class and show chat interface
    aiMessageElement.classList.add('image-placeholder');
    showChatInterface();

    try {
        // Call the Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('generate-image', {
            body: { prompt }
        });

        // Remove placeholder class
        aiMessageElement.classList.remove('image-placeholder');

        // Handle errors from the invoke call
        if (error) {
            throw new Error(error.message || "Unknown error invoking Supabase function.");
        }

        // Handle errors returned within the function response
        if (data && data.error) {
            throw new Error(data.error);
        }

        // Handle successful response with base64 image data
        if (data && data.b64_json) {
            const imageUrl = `data:image/png;base64,${data.b64_json}`;
            const revisedPrompt = data.revised_prompt;
            
            // Store for potential reuse
            state.setLastGeneratedImageUrl(imageUrl);
            
            // Construct final content with the image
            const finalContent = `<img src="${imageUrl}" alt="Generated image" style="max-width: 100%; border-radius: 6px; display: block; margin-top: 8px;">`;
            
            // Finalize content
            finalizeAIMessageContent(aiMessageElement, finalContent, false);
            setupMessageActions(aiMessageElement, imageUrl, true);
            
            // Add to history
            state.addMessageToHistory({
                role: 'assistant',
                content: '[Generated Image]',
                imageUrl: imageUrl
            });
            
            console.log("Image generated successfully.");
        } else {
            throw new Error("Function returned invalid data structure.");
        }
    } catch (error) {
        console.error("Error during image generation:", error);

        // Remove placeholder class if still present
        if (aiMessageElement.classList.contains('image-placeholder')) {
            aiMessageElement.classList.remove('image-placeholder');
        }

        // Display error in message
        const errorHtml = `<p class="error-message">Error generating image: ${escapeHTML(error.message || 'Unknown error')}</p>`;
        finalizeAIMessageContent(aiMessageElement, errorHtml, false);
        
        // Also show notification
        showNotification(`Error generating image: ${error.message || 'Please check console for details.'}`, 'error');
        
        // Add error message to history
        state.addMessageToHistory({
            role: 'assistant',
            content: `[Error generating image: ${error.message || 'Unknown error'}]`
        });
    }
}

/**
 * Handle Grok model completion
 */
async function handleGrokCompletion(settings, history, lastUserMessageEntry) {
    console.log(`Routing to Grok API for model: ${settings.model}`);
    
    // Check for X.AI API key
    const xaiApiKey = state.getXaiApiKey();
    if (!xaiApiKey) {
        showNotification("Error: X.AI API key is required for Grok models. Please add it in Settings.", 'error');
        return;
    }
    
    // Build messages payload
    const messagesPayload = buildMessagesPayload(history, settings.systemPrompt, settings.knowledgeContent);
    
    // Build request body
    const requestBody = {
        model: settings.model,
        messages: messagesPayload,
        stream: true,
        reasoning: true
    };

    await fetchGrokCompletions(xaiApiKey, requestBody);
}

/**
 * Handle Gemini model completion
 */
async function handleGeminiCompletion(settings, history, lastUserMessageEntry) {
    console.log(`Routing to Gemini API for model: ${settings.model}`);
    
    // Check for Gemini API key
    const geminiApiKey = state.getGeminiApiKey();
    if (!geminiApiKey) {
        showNotification("Error: Google Gemini API key is required. Please add it in Settings.", 'error');
        return;
    }
    
    // Build Gemini payloads
    const geminiContents = buildGeminiPayloadContents(history, null);
    if (!geminiContents) {
        showNotification("Failed to prepare message data for Gemini API.", "error");
        return;
    }
    
    // Inject knowledge content if available
    if (settings.knowledgeContent && geminiContents.length > 0) {
        const lastContent = geminiContents[geminiContents.length - 1];
        if (lastContent.role === 'user' && lastContent.parts) {
            const textPart = lastContent.parts.find(p => p.text !== undefined);
            if (textPart) {
                textPart.text = settings.knowledgeContent + "\n\n" + (textPart.text || '');
                console.log("Knowledge content prepended to last user message for Gemini.");
            } else {
                lastContent.parts.unshift({ text: settings.knowledgeContent });
                console.log("Knowledge content added as new text part to last user message for Gemini.");
            }
        }
    }
    
    const geminiSystemInstruction = buildGeminiSystemInstruction(settings.systemPrompt);
    const geminiGenerationConfig = buildGeminiGenerationConfig();
    
    // Call the Gemini API
    await fetchGeminiStream(
        geminiApiKey,
        settings.model,
        geminiContents,
        geminiSystemInstruction,
        geminiGenerationConfig
    );
}

/**
 * Handle o3-mini model completion
 */
async function handleO3MiniCompletion(settings, history, lastUserMessageEntry) {
    console.log("Routing to Chat Completions API for o3-mini");
    
    // Check for OpenAI API key
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: OpenAI API key is required. Please add it in Settings.", 'error');
        return;
    }
    
    // Build messages payload
    const messagesPayload = buildMessagesPayload(history, settings.systemPrompt, settings.knowledgeContent);
    
    // Reset previous response ID
    state.setPreviousResponseId(null);
    
    // Call the Chat Completions API
    await fetchChatCompletions(apiKey, messagesPayload);
}

/**
 * Handle o4-mini model completion
 */
async function handleO4MiniCompletion(settings, history, lastUserMessageEntry) {
    console.log("Routing to Responses API for o4-mini with high reasoning");
    
    // Check for OpenAI API key
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: OpenAI API key is required. Please add it in Settings.", 'error');
        return;
    }
    
    // Get previous response ID for conversation continuity
    const previousId = state.getPreviousResponseId();
    
    // Build input payload
    const inputPayload = buildResponsesApiInput(lastUserMessageEntry, settings.knowledgeContent, settings.systemPrompt);
    if (!inputPayload) {
        showNotification("Failed to prepare message data for API.", "error");
        return;
    }
    
    // Build request body
    const requestBody = {
        model: "o4-mini",
        input: inputPayload,
        stream: true,
        reasoning: { effort: "high" },
        ...(previousId && { previous_response_id: previousId }),
        ...(settings.capabilities.webSearch && { tools: [{ type: "web_search_preview" }] })
    };
    
    await fetchResponsesApi(apiKey, requestBody);
}

/**
 * Handle GPT-4 series model completion
 */
async function handleGPT4Completion(settings, history, lastUserMessageEntry) {
    console.log(`Routing to Responses API for ${settings.model} ${settings.capabilities.webSearch ? 'with Web Search' : ''}`);
    
    // Check for OpenAI API key
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: OpenAI API key is required. Please add it in Settings.", 'error');
        return;
    }
    
    // Get previous response ID for conversation continuity
    const previousId = state.getPreviousResponseId();
    
    // Build input payload
    const inputPayload = buildResponsesApiInput(lastUserMessageEntry, settings.knowledgeContent, settings.systemPrompt);
    if (!inputPayload) {
        showNotification("Failed to prepare message data for API.", "error");
        return;
    }
    
    // Build request body with the appropriate model
    const model = settings.model === 'gpt-4.1' ? 'gpt-4.1' :
                 settings.model === 'gpt-4.5-preview' ? 'gpt-4.5-preview' : 'gpt-4o';
    
    const requestBody = {
        model,
        input: inputPayload,
        stream: true,
        temperature: 0.8,
        ...(previousId && { previous_response_id: previousId }),
        ...(settings.capabilities.webSearch && { tools: [{ type: "web_search_preview" }] })
    };
    
    await fetchResponsesApi(apiKey, requestBody);
}


// --- TTS Function ---
/**
 * Fetches synthesized speech audio from OpenAI TTS API.
 */
export async function fetchSpeechFromChat(text, voice = 'alloy', format = 'mp3', instructions = null) {
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: API key is not set. Please go to Settings.", 'error');
        return null;
    }

    try {
        const openai = getOpenAIClient();
        if (!openai) {
            throw new Error("Failed to initialize OpenAI client");
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-audio-preview",
            modalities: ["text", "audio"],
            audio: { voice, format },
            messages: [{ role: "user", content: instructions ? `${instructions}\n\n${text}` : text }],
        });

        const base64Data = response.choices?.[0]?.message?.audio?.data;
        if (!base64Data) return null;

        return new Blob([Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))], { type: `audio/${format}` });
    } catch (error) {
        console.error('Error fetching speech:', error);
        showNotification('Failed to generate speech. Please try again.', 'error');
        return null;
    }
}


// --- Helper Functions to construct payloads ---

// Correct for Chat Completions (o3-mini, Grok)
function buildMessagesPayload(history, systemPrompt, knowledgeContent) {
    let payload = [];
    if (systemPrompt) {
        payload.push({ role: "system", content: systemPrompt });
    }

    // Need to filter out imageData for o3-mini and Grok
    let historyCopy = history.map(m => ({ role: m.role, content: m.content }));

    if (knowledgeContent && historyCopy.length > 0) {
        const lastUserIndex = historyCopy.findLastIndex(m => m.role === 'user');
        if (lastUserIndex !== -1) {
            historyCopy[lastUserIndex].content = knowledgeContent + "\n\n" + (historyCopy[lastUserIndex].content || ''); // Prepend knowledge
            console.log("Knowledge content prepended to last user message for Chat Completions/Grok.");
        } else { console.warn("Could not find user message to prepend knowledge to."); }
    }
    payload = payload.concat(historyCopy);
    return payload;
}

/**
 * Builds the 'input' array for Responses API.
 * Reads image data from the provided history entry.
 * Prepends system prompt and knowledge content to the user message content.
 * Correctly formats image content using 'image_url' as a STRING containing the Data URL.
 * Returns null on failure.
 */
function buildResponsesApiInput(lastUserMessageEntry, knowledgeContent, systemPrompt) {
    console.log("--- Inside buildResponsesApiInput ---");
    console.log("Received lastUserMessageEntry:", lastUserMessageEntry);

    let inputPayload = [];
    let contentArray = [];
    const userContent = lastUserMessageEntry?.content || "";
    const imageDataBase64 = lastUserMessageEntry?.imageData;

    console.log("Extracted imageDataBase64:", imageDataBase64 ? "Image data found" : "No image data found in history entry");

    // --- Inject Last Generated Image URL (If applicable) ---
    const imageUrlToInject = state.getLastGeneratedImageUrl();
    if (imageUrlToInject) {
        contentArray.push({
            type: "input_image",
            image_url: imageUrlToInject
        });
        state.clearLastGeneratedImageUrl(); // Clear after use
        console.log("Injected previously generated image URL into input.");
    }

    // --- Combine text content ---
    let combinedUserContent = userContent;
    if (knowledgeContent) {
        combinedUserContent = knowledgeContent + "\n\n" + combinedUserContent;
        console.log("Knowledge content prepended to user message for Responses API.");
    }
    if (systemPrompt) {
        combinedUserContent = systemPrompt + "\n\n" + combinedUserContent;
        console.log("System prompt prepended to user message content for Responses API.");
    }

    // --- Add text part ---
    if (combinedUserContent) {
        contentArray.push({
            type: "input_text",
            text: combinedUserContent
        });
    }

    // --- Add image from history entry ---
    if (imageDataBase64) {
        try {
            if (!imageDataBase64.startsWith('data:image/')) {
                throw new Error("Invalid image data format found in history entry.");
            }
            contentArray.push({
                type: "input_image",
                image_url: imageDataBase64 // Use the data from the history entry
            });
            console.log(`Added input_image to contentArray from history entry.`);

        } catch (error) {
            console.error("Error processing image from history for API payload:", error);
            showNotification("Error preparing image data for API. Please try again.", "error");
            return null; // Indicate payload creation failed
        }
    }
    // --- End Image Part ---

    console.log("Final contentArray before creating message object:", contentArray);

    // --- Build final message object ---
    if (contentArray.length > 0) {
        inputPayload.push({
            type: "message",
            role: "user",
            content: contentArray // Content is always an array if image or text exists
        });
    } else {
        console.warn("buildResponsesApiInput: No text or valid image data to send. Payload empty.");
        // Return null or empty array? Returning empty array which API should handle.
    }

    return inputPayload;
}


// ==================================================
// == API Fetch Helpers ==
// ==================================================

async function fetchChatCompletions(apiKey, messagesPayload) {
    resetParser();
    showTypingIndicator();
    let aiMessageElement = null;
    let streamEnded = false;
    try {
        const requestBody = { model: 'o3-mini', messages: messagesPayload, stream: true, reasoning_effort: 'high' };
        console.log("Sending API Request (Chat Completions):", JSON.stringify(requestBody, null, 2));
        const response = await fetch(CHAT_COMPLETIONS_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody) });
        if (!response.ok) {
            removeTypingIndicator();
            const errorData = await response.json().catch(() => ({ error: { message: "Failed to parse error response." } }));
            console.error("API Error Response (Chat Completions):", errorData);
            let errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
            if (response.status === 401) errorMessage = "Authentication Error: Invalid API Key.";
            else if (response.status === 429) errorMessage = "Rate Limit Exceeded.";
            else if (errorData.error?.code === 'context_length_exceeded') errorMessage = "Context length exceeded. Try a shorter prompt/knowledge or start a new chat.";
            showNotification(`Error: ${errorMessage}`, 'error', 5000);
            throw new Error(errorMessage);
        }
        const reader = response.body?.getReader();
        if (!reader) { removeTypingIndicator(); throw new Error("Failed to get response body reader."); }
        const decoder = new TextDecoder('utf-8');
        let streamStarted = false, buffer = '', accumulatedContent = false;
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) {
                    const result = processChatCompletionsEvent(buffer, aiMessageElement, streamStarted, accumulatedContent);
                    if (result) { if (result.aiMessageElement) aiMessageElement = result.aiMessageElement; if (result.streamStarted !== undefined) streamStarted = result.streamStarted; if (result.accumulatedContent !== undefined) accumulatedContent = result.accumulatedContent; }
                }
                streamEnded = true; break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex; const eventDelimiter = '\n\n';
            while ((newlineIndex = buffer.indexOf(eventDelimiter)) !== -1) {
                const eventBlock = buffer.slice(0, newlineIndex); buffer = buffer.slice(newlineIndex + eventDelimiter.length);
                const lines = eventBlock.split('\n');
                for (const line of lines) {
                    const result = processChatCompletionsEvent(line, aiMessageElement, streamStarted, accumulatedContent);
                    if (result) { if (result.aiMessageElement) aiMessageElement = result.aiMessageElement; if (result.streamStarted !== undefined) streamStarted = result.streamStarted; if (result.accumulatedContent !== undefined) accumulatedContent = result.accumulatedContent; if (result.streamEnded) { streamEnded = true; } }
                }
            }
        }
        if (!streamStarted) removeTypingIndicator();
        if (aiMessageElement) {
            const finalRawText = getAccumulatedRawText();
            if (finalRawText || streamStarted) { // Finalize even if response was empty but stream started
                const finalHtml = parseFinalHtml();
                finalizeAIMessageContent(aiMessageElement, finalHtml || "[Empty Response]");
                state.addMessageToHistory({ role: "assistant", content: finalRawText });
                setupMessageActions(aiMessageElement, finalRawText);
            }
        } else if (!streamStarted) { console.log("Chat completions stream ended without any content delta."); }
    } catch (error) {
        console.error('Error during Chat Completions API call:', error); removeTypingIndicator();
        if (!error.message.startsWith('HTTP error') && !error.message.startsWith('Authentication Error') && !error.message.startsWith('Rate Limit Exceeded') && !error.message.startsWith('Context length exceeded')) { showNotification(`An unexpected error occurred: ${error.message}`, 'error'); }
        streamEnded = true;
    } finally {
        if (!streamEnded && aiMessageElement) {
            console.warn("Stream ended unexpectedly, finalizing with accumulated content."); const finalRawText = getAccumulatedRawText(); const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml);
            if (finalRawText) state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText);
        }
        removeTypingIndicator(); // Ensure indicator is removed in all cases
    }
}


/**
 * Processes a single event line from the Chat Completions stream.
 */
function processChatCompletionsEvent(line, aiMessageElement, streamStarted, accumulatedContent) {
    let currentAccumulatedContent = accumulatedContent;
    let isDone = false;

    if (line.startsWith('data: ')) {
        const data = line.substring(5).trim();
        if (data === '[DONE]') {
            isDone = true;
            return { aiMessageElement, streamStarted, accumulatedContent: currentAccumulatedContent, streamEnded: true };
        }

        try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;

            // Handle content delta
            if (delta && (delta.content || typeof delta.content === 'string')) { // Check even if empty string
                if (!streamStarted) {
                    removeTypingIndicator();
                    aiMessageElement = createAIMessageContainer();
                    if (!aiMessageElement) throw new Error("UI container creation failed.");
                    streamStarted = true;
                }
                if (delta.content) { // Only mark as contentful if non-empty
                    currentAccumulatedContent = true;
                    const escapedChunk = accumulateChunkAndGetEscaped(delta.content);
                    if (aiMessageElement && escapedChunk) {
                        appendAIMessageContent(aiMessageElement, escapedChunk);
                    }
                }
            }

            if (finishReason) {
                console.log("Chat Completions Stream finished with reason:", finishReason);
                if (!streamStarted) removeTypingIndicator(); // Remove indicator if stream finished without content
                isDone = true;
            }
            return { aiMessageElement, streamStarted, accumulatedContent: currentAccumulatedContent, streamEnded: isDone };

        } catch (e) {
            if (!streamStarted) removeTypingIndicator();
            console.error('Error parsing Chat Completions stream chunk:', data, e);
            if (aiMessageElement) appendAIMessageContent(aiMessageElement, escapeHTML("\n\n[Error processing response stream]"));
            return { aiMessageElement, streamStarted, accumulatedContent: currentAccumulatedContent, streamEnded: true };
        }
    }
    return { aiMessageElement, streamStarted, accumulatedContent: currentAccumulatedContent, streamEnded: false };
}


async function fetchResponsesApi(apiKey, requestBody) {
    resetParser();
    showTypingIndicator();
    let aiMessageElement = null;
    let streamEnded = false;
    try {
        console.log("Sending API Request (Responses API):", JSON.stringify(requestBody, null, 2)); // Keep this log
        const response = await fetch(RESPONSES_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(requestBody) });
        if (!response.ok) {
            removeTypingIndicator();
            let errorMsg = `HTTP error! Status: ${response.status}`; let errorData = {};
            try { errorData = await response.json(); errorMsg = errorData.error?.message || errorMsg; console.error("API Error Response (Responses API):", errorData); }
            catch (parseError) { console.error("Failed to parse Responses API error response:", parseError); errorMsg = `Responses API request failed with status ${response.status}. Could not parse error detail.`; }
            if (response.status === 401) errorMsg = "Authentication Error: Invalid API Key.";
            else if (response.status === 429) errorMsg = "Rate Limit Exceeded.";
            else if (response.status === 400) errorMsg = `Invalid Request: ${errorMsg}`;
            else if (response.status >= 500) errorMsg = `Server Error (${response.status}): ${errorMsg}`;
            showNotification(`Error: ${errorMsg}`, 'error', 7000);
            throw new Error(errorMsg);
        }
        const reader = response.body?.getReader();
        if (!reader) { removeTypingIndicator(); throw new Error("Failed to get response body reader."); }
        const decoder = new TextDecoder('utf-8');
        let lastItemId = null, streamHasContent = false, buffer = '', finalResponseId = null;
        let webSearchResults = null; // Store web search results

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) {
                    const result = processResponsesEvent(buffer, aiMessageElement, lastItemId, streamHasContent, webSearchResults);
                    if (result) {
                         if (result.aiMessageElement) aiMessageElement = result.aiMessageElement;
                         if (result.lastItemId) lastItemId = result.lastItemId;
                         if (result.streamHasContent !== undefined) streamHasContent = result.streamHasContent;
                         if (result.finalResponseId) finalResponseId = result.finalResponseId;
                         if (result.webSearchResults) webSearchResults = result.webSearchResults; // Update results
                         if (result.streamEnded) streamEnded = true;
                    }
                }
                streamEnded = true; break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex; const eventDelimiter = '\n\n';
            while ((newlineIndex = buffer.indexOf(eventDelimiter)) !== -1) {
                const eventBlock = buffer.slice(0, newlineIndex); buffer = buffer.slice(newlineIndex + eventDelimiter.length);
                const lines = eventBlock.split('\n');
                for (const line of lines) {
                    const result = processResponsesEvent(line, aiMessageElement, lastItemId, streamHasContent, webSearchResults);
                     if (result) {
                         if (result.aiMessageElement) aiMessageElement = result.aiMessageElement;
                         if (result.lastItemId) lastItemId = result.lastItemId;
                         if (result.streamHasContent !== undefined) streamHasContent = result.streamHasContent;
                         if (result.finalResponseId) finalResponseId = result.finalResponseId;
                         if (result.webSearchResults) webSearchResults = result.webSearchResults; // Update results
                         if (result.streamEnded) streamEnded = true;
                     }
                }
            }
        }
        removeTypingIndicator(); // Ensure indicator removed after loop

        if (finalResponseId) { state.setPreviousResponseId(finalResponseId); console.log("Responses API stream finished. Final Response ID:", finalResponseId); }
        else { console.warn("Responses API stream finished but no final response ID received in completed event."); }

        if (aiMessageElement) {
            // Render web search results if they exist BEFORE finalizing main content
            if (webSearchResults) {
                 processWebSearchResults(webSearchResults, aiMessageElement);
            }

            const finalRawText = getAccumulatedRawText();
            if (streamHasContent || finalResponseId || webSearchResults) { // Finalize if content OR web search OR if stream completed successfully
                const finalHtml = parseFinalHtml();
                // Append main content AFTER web search results
                finalizeAIMessageContent(aiMessageElement, finalHtml || (webSearchResults ? "" : "[AI responded without text content]"), !!webSearchResults); // Pass flag indicating if web search was rendered

                state.addMessageToHistory({ role: "assistant", content: finalRawText });
                setupMessageActions(aiMessageElement, finalRawText);
            } else {
                // Only happens if stream errored *before* creating the message container and no web search
                console.log("Stream completed without generating any message item or text content, and no web search results.");
            }
        } else if (streamHasContent || webSearchResults) {
            // Should not happen if createAIMessageContainer is called early, but defensive coding
            console.error("Stream had content or web results but UI element was missing at the end.");
            aiMessageElement = createAIMessageContainer();
            if (aiMessageElement) {
                if (webSearchResults) processWebSearchResults(webSearchResults, aiMessageElement);
                const finalRawText = getAccumulatedRawText();
                const finalHtml = parseFinalHtml();
                finalizeAIMessageContent(aiMessageElement, finalHtml || (webSearchResults ? "" : "[AI responded without text content]"), !!webSearchResults);
                state.addMessageToHistory({ role: "assistant", content: finalRawText });
                setupMessageActions(aiMessageElement, finalRawText);
            }
        } else {
            console.log("Stream completed without generating any message item, text content or web search results.");
        }

    } catch (error) {
        console.error('Error during Responses API call:', error); removeTypingIndicator();
        streamEnded = true;
    } finally {
        if (!streamEnded && aiMessageElement) {
            console.warn("Stream ended unexpectedly (Responses API), finalizing with accumulated content.");
            removeTypingIndicator(); // Ensure removal
            // Finalize main content
            const finalRawText = getAccumulatedRawText();
            const finalHtml = parseFinalHtml();
            finalizeAIMessageContent(aiMessageElement, finalHtml || (webSearchResults ? "" : "[Incomplete Response]"), !!webSearchResults);

            // Add potentially incomplete main content to history
            if (finalRawText || webSearchResults) { // Add if either main or reasoning exists
                 const existingEntry = state.getChatHistory().find(m => m.role === 'assistant' && m.content === finalRawText);
                 if (!existingEntry) {
                     state.addMessageToHistory({ role: "assistant", content: finalRawText });
                 }
            }
            // Setup actions even if incomplete
            setupMessageActions(aiMessageElement, finalRawText);
        }
        // Ensure indicator is always removed if it wasn't already
        removeTypingIndicator();
    }
}


/**
 * Processes a single event line from the Responses API stream.
 */
function processResponsesEvent(line, aiMessageElement, lastItemId, streamHasContent, webSearchResults) {
    let updatedAiMessageElement = aiMessageElement;
    let updatedLastItemId = lastItemId;
    let updatedStreamHasContent = streamHasContent;
    let updatedWebSearchResults = webSearchResults;
    let finalResponseId = null;
    let isStreamEndEvent = false;

    if (line.startsWith('event: ')) { /* Ignore event line */ }
    else if (line.startsWith('data: ')) {
        const data = line.substring(5).trim();
        if (data === '[DONE]') { console.log("Received [DONE] signal."); isStreamEndEvent = true; return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, webSearchResults: updatedWebSearchResults, finalResponseId, streamEnded: true }; }
        try {
            const parsed = JSON.parse(data); const eventType = parsed.type;
            if (eventType === 'response.created') {
                removeTypingIndicator(); // Remove basic indicator once response starts
                console.log("Response Created Event:", parsed.response?.id);
            }
            else if (eventType === 'response.tool_use.started' && parsed.tool_use?.type === 'web_search_preview') { console.log("Web search started..."); showTypingIndicator("Searching the web..."); }
            else if (eventType === 'response.tool_use.output' && parsed.tool_use?.type === 'web_search_preview') {
                 console.log("Web search finished. Results received:", parsed.tool_use.output);
                 showTypingIndicator("Thinking..."); // Change back to thinking
                 updatedWebSearchResults = parsed.tool_use.output; // Store results
            }
            else if (eventType === 'response.tool_use.failed' && parsed.tool_use?.type === 'web_search_preview') { console.error("Web search failed:", parsed.error); showTypingIndicator("Thinking..."); showNotification("Web search failed to complete.", "warning"); }
            else if (eventType === 'response.output_item.added' && parsed.item?.type === 'message') {
                // Create container but DON'T remove the typing indicator yet (unless web search already finished)
                if (!updatedAiMessageElement) {
                    updatedAiMessageElement = createAIMessageContainer();
                    updatedLastItemId = parsed.item?.id;
                    if (!updatedAiMessageElement) throw new Error("UI container creation failed.");
                    console.log("AI message container created for item ID:", updatedLastItemId);
                    // Don't remove typing indicator here UNLESS web search finished (no text delta yet)
                    if (updatedWebSearchResults && !updatedStreamHasContent) {
                        removeTypingIndicator();
                    }
                }
            }
            else if (eventType === 'response.output_text.delta' && parsed.item_id === updatedLastItemId) {
                // Handle text delta, including empty string
                if (parsed.delta || typeof parsed.delta === 'string') {
                    if (!updatedAiMessageElement) {
                        // Defensive: If somehow delta arrives before item.added event processed
                        console.error("Received text delta but AI message element doesn't exist!");
                        updatedAiMessageElement = createAIMessageContainer();
                        if (!updatedAiMessageElement) throw new Error("UI container creation failed (defensive).");
                    }

                    // Only when we have actual content, remove the typing indicator
                    if (parsed.delta && !updatedStreamHasContent) {
                        removeTypingIndicator(); // Remove indicator when we have actual content
                    }

                    if (parsed.delta) { // Only mark as contentful if non-empty
                        updatedStreamHasContent = true;
                        const escapedChunk = accumulateChunkAndGetEscaped(parsed.delta);
                        if (updatedAiMessageElement && escapedChunk) {
                            // Append normally, web search results are handled separately
                            appendAIMessageContent(updatedAiMessageElement, escapedChunk);
                        }
                    }
                }
            }
            else if (eventType === 'response.completed' || eventType === 'response.failed' || eventType === 'response.incomplete') {
                isStreamEndEvent = true;
                removeTypingIndicator(); // Final removal
                console.log("Responses API Stream Finish Event:", eventType, parsed.response);
                if (parsed.response?.id) { finalResponseId = parsed.response.id; }
                if (eventType === 'response.failed') { showNotification(`AI response failed: ${parsed.error?.message || 'Unknown reason'}`, 'error'); }
                else if (eventType === 'response.incomplete') { showNotification(`AI response may be incomplete: ${parsed.reason || 'Unknown reason'}`, 'warning'); }
            }
            // NOTE: Removed direct handling of response.web_search_results as it's handled via tool_use.output now
            return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, webSearchResults: updatedWebSearchResults, finalResponseId, streamEnded: isStreamEndEvent };
        } catch (e) {
            removeTypingIndicator(); console.error('Error parsing Responses API stream chunk or handling event:', data, e);
            if (updatedAiMessageElement) appendAIMessageContent(updatedAiMessageElement, escapeHTML("\n\n[Error processing response stream]"));
            return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, webSearchResults: updatedWebSearchResults, finalResponseId: null, streamEnded: true };
        }
    }
    return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, webSearchResults: updatedWebSearchResults, finalResponseId, streamEnded: false };
}

/**
 * Renders web search results into the message container.
 * This is called AFTER the stream finishes or when results are received, BEFORE finalizing the main text content.
 */
function processWebSearchResults(data, messageElement) {
    if (!data || !messageElement) return;

    // First, ensure typing indicator is removed when we display search results
    removeTypingIndicator();

    const contentElement = messageElement.querySelector('.ai-message-content');
    if (!contentElement) {
        console.error("Could not find .ai-message-content to render web search results.");
        return;
    }

    // Format the data for our renderer
    const searchData = {
        query: data.query || 'Search Results', // Provide a default title
        results: data.results || []
    };

    // Use our new renderer to create the formatted results element
    const formattedResultsElement = renderImprovedWebSearchResults(searchData);

    // Prepend the search results to the message content element
    // This ensures results appear *before* the main AI text response.
    contentElement.insertBefore(formattedResultsElement, contentElement.firstChild);
    console.log("Web search results rendered.");
}


async function fetchGrokCompletions(apiKey, requestBody) {
    resetParser(); // For main content
    showTypingIndicator();
    let aiMessageElement = null;
    let streamEnded = false;
    let reasoningContent = ''; // Accumulate RAW reasoning content for final parse
    let hasContent = false; // Tracks if main content was received
    let streamStarted = false; // Tracks if any delta (main or reasoning) was received
    let reasoningSection = null;
    let toggleButton = null;

    try {
        console.log("Sending API Request (Grok):", JSON.stringify(requestBody, null, 2));
        const response = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            removeTypingIndicator();
            const errorData = await response.json().catch(() => ({ error: { message: "Failed to parse error response." } }));
            console.error("API Error Response (Grok):", errorData);
            let errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
            if (response.status === 401) errorMessage = "Authentication Error: Invalid X.AI API Key.";
            else if (response.status === 429) errorMessage = "Rate Limit Exceeded.";
            showNotification(`Error: ${errorMessage}`, 'error', 5000);
            throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            removeTypingIndicator();
            throw new Error("Failed to get response body reader.");
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (!streamEnded) {
            const { done, value } = await reader.read();
            if (done) {
                streamEnded = true;
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        streamEnded = true;
                        break;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;

                        if (!delta) continue; // Skip if no delta

                        // --- Handle Main Content Delta ---
                        if (delta.content) {
                            if (!streamStarted) {
                                removeTypingIndicator();
                                aiMessageElement = createAIMessageContainer();
                                if (!aiMessageElement) throw new Error("UI container creation failed.");
                                streamStarted = true;
                            }
                            hasContent = true;
                            const escapedChunk = accumulateChunkAndGetEscaped(delta.content);
                            if (aiMessageElement && escapedChunk) {
                                appendAIMessageContent(aiMessageElement, escapedChunk);
                            }
                        }

                        // --- Handle Reasoning Content Delta ---
                        if (delta.reasoning_content) {
                            if (!streamStarted) {
                                // Create container if only reasoning arrives first
                                removeTypingIndicator();
                                aiMessageElement = createAIMessageContainer();
                                if (!aiMessageElement) throw new Error("UI container creation failed.");
                                streamStarted = true;
                            }

                            // Initialize reasoning section and toggle button ONCE
                            if (!reasoningSection && !toggleButton && aiMessageElement) {
                                reasoningSection = document.createElement('div');
                                reasoningSection.className = 'ai-message-reasoning'; // Initially hidden by CSS

                                toggleButton = document.createElement('button');
                                toggleButton.className = 'toggle-reasoning-button';
                                toggleButton.textContent = 'Show Thinking';
                                toggleButton.onclick = () => {
                                    const isVisible = reasoningSection.classList.toggle('visible');
                                    toggleButton.textContent = isVisible ? 'Hide Thinking' : 'Show Thinking';
                                };

                                // Add elements to the message container (button first)
                                aiMessageElement.insertBefore(toggleButton, aiMessageElement.firstChild);
                                aiMessageElement.insertBefore(reasoningSection, toggleButton.nextSibling);
                            }

                            // **MODIFIED: Stream escaped content & accumulate raw**
                            if (reasoningSection) {
                                const rawChunk = delta.reasoning_content;
                                reasoningContent += rawChunk; // Accumulate RAW chunk

                                const escapedReasoningChunk = escapeHTML(rawChunk); // Escape for live display
                                reasoningSection.innerHTML += escapedReasoningChunk; // Append escaped chunk

                                // Optional: Auto-scroll if visible
                                if (reasoningSection.classList.contains('visible')) {
                                    reasoningSection.scrollTop = reasoningSection.scrollHeight;
                                }
                            }
                        }

                        // --- Handle Finish Reason ---
                        if (parsed.choices?.[0]?.finish_reason) {
                            console.log("Grok stream finished with reason:", parsed.choices[0].finish_reason);
                            streamEnded = true;
                        }
                    } catch (e) {
                        console.error('Error parsing Grok stream chunk:', data, e);
                        if (!streamStarted) {
                            removeTypingIndicator();
                            aiMessageElement = createAIMessageContainer(); // Ensure container exists on error
                            streamStarted = true;
                        }
                        if (aiMessageElement) {
                            appendAIMessageContent(aiMessageElement, escapeHTML("\n\n[Error processing response stream]"));
                        }
                        streamEnded = true; // Stop processing on error
                    }
                }
            }
        }

        // --- Final Processing after Stream Ends ---
        removeTypingIndicator(); // Ensure indicator is removed

        if (aiMessageElement) {
            // Handle main content finalization
            const finalRawText = getAccumulatedRawText(); // From main content parser
            if (hasContent || streamStarted) { // Finalize if content or if stream started (even if empty)
                const finalHtml = parseFinalHtml(); // Parse accumulated main content
                finalizeAIMessageContent(aiMessageElement, finalHtml || "[Empty Response]");
                // Add main content to history
                state.addMessageToHistory({ role: "assistant", content: finalRawText });
                // Setup actions for main content
                setupMessageActions(aiMessageElement, finalRawText);
            } else if (!reasoningContent) {
                // If no main content AND no reasoning, maybe add a placeholder?
                // Or rely on the finalizeAIMessageContent above handling empty string
                console.log("Grok stream finished with no main or reasoning content.");
                 // Still need to create/finalize if only reasoning was present but now empty
                 if (!hasContent && streamStarted && !reasoningContent) {
                     finalizeAIMessageContent(aiMessageElement, "[Empty Response]");
                     // Decide if empty assistant messages should be stored
                     // state.addMessageToHistory({ role: "assistant", content: "" });
                     // setupMessageActions(aiMessageElement, "");
                 }
            }


            // **MODIFIED: Finalize reasoning content**
            if (reasoningSection && reasoningContent) {
                try {
                    // Parse the *entire accumulated raw* reasoning content
                    const parsedReasoningHtml = marked.parse(reasoningContent);
                    // Replace the streamed (escaped) content with the fully parsed HTML
                    reasoningSection.innerHTML = parsedReasoningHtml;
                } catch (error) {
                    console.error('Error parsing final reasoning content:', error);
                    // Fallback: Ensure the final content is at least escaped if parsing fails
                    reasoningSection.innerHTML = escapeHTML(reasoningContent);
                }
            }
             // Ensure actions are set up even if only reasoning content exists
             if (!hasContent && reasoningContent && aiMessageElement) {
                 const finalRawText = getAccumulatedRawText(); // Will be empty if no main content
                 if (!state.getChatHistory().some(m => m.role === 'assistant' && m.content === finalRawText)) {
                     state.addMessageToHistory({ role: "assistant", content: finalRawText }); // Add empty message if needed
                 }
                 setupMessageActions(aiMessageElement, finalRawText); // Setup actions even for empty main content
             }

        } else {
             console.log("Grok stream finished without creating a message element (no deltas received).");
        }

    } catch (error) {
        console.error('Error during Grok API call:', error);
        removeTypingIndicator();
        if (!error.message.startsWith('HTTP error') &&
            !error.message.startsWith('Authentication Error') &&
            !error.message.startsWith('Rate Limit Exceeded')) {
            showNotification(`An unexpected error occurred: ${error.message}`, 'error');
        }
        streamEnded = true; // Mark as ended if error occurred
    } finally {
        // --- Finalization in Finally Block (Handles unexpected stream end) ---
        if (!streamEnded && aiMessageElement) {
            console.warn("Grok stream ended unexpectedly, finalizing with accumulated content.");
            removeTypingIndicator(); // Ensure it's removed

            // Finalize main content
            const finalRawText = getAccumulatedRawText();
            const finalHtml = parseFinalHtml();
            finalizeAIMessageContent(aiMessageElement, finalHtml || "[Incomplete Response]");

            // **MODIFIED: Finalize reasoning content in finally block**
            if (reasoningSection && reasoningContent) {
                try {
                    const parsedReasoningHtml = marked.parse(reasoningContent);
                    reasoningSection.innerHTML = parsedReasoningHtml; // Replace potentially incomplete stream
                } catch (error) {
                    console.error('Error parsing reasoning content in finally block:', error);
                    reasoningSection.innerHTML = escapeHTML(reasoningContent); // Fallback
                }
            }

            // Add potentially incomplete main content to history
            if (finalRawText || reasoningContent) { // Add if either main or reasoning exists
                 const existingEntry = state.getChatHistory().find(m => m.role === 'assistant' && m.content === finalRawText);
                 if (!existingEntry) {
                     state.addMessageToHistory({ role: "assistant", content: finalRawText });
                 }
            }
            // Setup actions even if incomplete
            setupMessageActions(aiMessageElement, finalRawText);
        }
        // Ensure indicator is always removed if it wasn't already
        removeTypingIndicator();
    }
}
