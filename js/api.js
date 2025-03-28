// ===== FILE: js/api.js =====
// MODIFIED: Use accumulateChunkAndGetEscaped during stream, parseFinalHtml at the end.
// MODIFIED: Corrected image payload structure for /v1/responses API based on documentation and errors.
import * as state from './state.js';
// Use new functions from messageList for appending/finalizing
import { showTypingIndicator, removeTypingIndicator, createAIMessageContainer, appendAIMessageContent, finalizeAIMessageContent, setupMessageActions } from './components/messageList.js';
import { showNotification } from './components/notification.js';
// Use new functions from parser
import { resetParser, accumulateChunkAndGetEscaped, parseFinalHtml, getAccumulatedRawText } from './parser.js';
import { escapeHTML } from './utils.js';

// API Endpoints
const CHAT_COMPLETIONS_API_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const TTS_API_URL = 'https://api.openai.com/v1/audio/speech';
const IMAGE_GENERATION_API_URL = 'https://api.openai.com/v1/images/generations';

// --- API Routing ---

/**
 * Main function to decide which API endpoint to call based on model and features.
 * Incorporates active Custom GPT configuration.
 * @param {string} selectedModelSetting - The *default* model setting chosen by the user.
 * @param {boolean} useWebSearch - Whether web search was toggled ON for this message.
 */
export async function routeApiCall(selectedModelSetting, useWebSearch) {
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: API key is not set. Please go to Settings.", 'error');
        return;
    }

    const activeConfig = state.getActiveCustomGptConfig();
    const history = state.getChatHistory();
    const image = state.getCurrentImage(); // { data: base64string, name: filename }
    const isImageGenMode = state.getIsImageGenerationMode();

    // --- Determine effective settings based on activeConfig ---
    let finalModel = selectedModelSetting;
    let finalSystemPrompt = null;
    let knowledgeContent = "";
    let capabilities = { webSearch: useWebSearch };

    if (activeConfig) {
        console.log(`Using Custom GPT Config: "${activeConfig.name}"`);
        finalSystemPrompt = activeConfig.instructions || null;

        if (activeConfig.knowledgeFiles && activeConfig.knowledgeFiles.length > 0) {
            knowledgeContent = activeConfig.knowledgeFiles
                .filter(kf => kf.content && !kf.error)
                .map(kf => `--- START Knowledge: ${kf.name} ---\n${kf.content}\n--- END Knowledge: ${kf.name} ---`)
                .join('\n\n');
            if (knowledgeContent) {
                console.log(`Injecting content from ${activeConfig.knowledgeFiles.filter(kf => kf.content && !kf.error).length} knowledge file(s).`);
            }
        }

        if (activeConfig.capabilities && activeConfig.capabilities.webSearch !== undefined) {
            capabilities.webSearch = activeConfig.capabilities.webSearch;
            console.log(`Web search capability from config: ${capabilities.webSearch}`);
        }

        // Force gpt-4o if config uses features not compatible with o3-mini
        if (finalModel === 'o3-mini-high' && (image || capabilities.webSearch || knowledgeContent || finalSystemPrompt)) {
            console.warn(`Custom GPT "${activeConfig.name}" uses features likely requiring gpt-4o. Forcing model to gpt-4o.`);
            finalModel = 'gpt-4o';
        }
        // Ensure web search is only active if the final model is gpt-4o
        if (finalModel !== 'gpt-4o') {
            capabilities.webSearch = false;
        }

    } else {
        console.log("Using default chat behavior (no Custom GPT config active).");
        finalModel = selectedModelSetting;
        capabilities.webSearch = useWebSearch;
        // Ensure web search is only active if the final model is gpt-4o
        if (finalModel !== 'gpt-4o') {
            capabilities.webSearch = false;
        }
    }
    // --- End Determining Settings ---

    const lastUserMessageEntry = history.filter(m => m.role === 'user').pop();
    const lastUserMessageContent = lastUserMessageEntry?.content || "";
    // Check if there's *any* user input (original text, image, or injected knowledge/system prompt)
    const effectiveInputExists = lastUserMessageContent || image || knowledgeContent || finalSystemPrompt;

    if (!history.length || !effectiveInputExists) {
        console.error("Cannot call API: No effective user input (text, image, knowledge, or system prompt) in the last turn.");
        showNotification("Please type a message, upload an image, or ensure your Custom GPT provides context.", 'info');
        return;
    }

    // Check for image generation mode first
    if (isImageGenMode && finalModel === 'gpt-4o') {
        console.log("Routing to DALL-E 3 for image generation");
        const result = await fetchImageGeneration(apiKey, lastUserMessageContent);
        if (result) {
            console.log("Attempting to create container for generated image...");
            const aiMessageElement = createAIMessageContainer();
            if (aiMessageElement) {
                console.log("Image container created. Populating content...");
                let content = `<img src="${result.imageUrl}" alt="Generated image" style="max-width: 100%; border-radius: 6px; display: block; margin-top: 8px;">`;
                if (result.revisedPrompt) {
                    content = `<p>Revised prompt: <em>${escapeHTML(result.revisedPrompt)}</em></p>` + content;
                }
                // Using finalize directly since it's not streaming
                finalizeAIMessageContent(aiMessageElement, content);
                console.log("Image content finalized.");
                
                // Setup actions with isImageMessage flag
                setupMessageActions(aiMessageElement, result.imageUrl, true);
                console.log("Image actions set up.");
                
                // Add to history with imageUrl
                console.log("Adding image message to history...");
                state.addMessageToHistory({
                    role: 'assistant',
                    content: result.revisedPrompt ? `Revised prompt: ${result.revisedPrompt}` : '[Generated Image]',
                    imageUrl: result.imageUrl
                });
                console.log("Image message added to history.");
                
                // --- >>> STORE URL FOR NEXT TURN <<< ---
                state.setLastGeneratedImageUrl(result.imageUrl);
                // --- >>> END STORE URL <<< ---
                
            } else {
                console.error("Failed to create AI message container for the image!");
                showNotification("Failed to display generated image.", "error");
                state.clearLastGeneratedImageUrl(); // Clear if UI fails
            }
        } else {
            console.log("Image generation call returned null, skipping UI update.");
            state.clearLastGeneratedImageUrl(); // Clear if API fails
        }
        return;
    }

    // --- API Routing for chat/responses ---
    if (finalModel === 'o3-mini-high') {
        console.log("Routing to Chat Completions API for o3-mini");
        const messagesPayload = buildMessagesPayload(history, finalSystemPrompt, knowledgeContent);
        state.setPreviousResponseId(null);
        await fetchChatCompletions(apiKey, messagesPayload);

    } else if (finalModel === 'gpt-4o') {
        console.log(`Routing to Responses API for gpt-4o ${capabilities.webSearch ? 'with Web Search' : ''}`);
        const previousId = state.getPreviousResponseId();

        // Build payload
        let inputPayload = buildResponsesApiInput(lastUserMessageEntry, image, knowledgeContent, finalSystemPrompt);
        if (!inputPayload) { // Check if payload creation failed
            showNotification("Failed to prepare message data for API.", "error");
            return; // Stop the API call
        }


        const requestBody = {
            model: 'gpt-4o',
            input: inputPayload,
            stream: true,
            temperature: 0.8,
            ...(previousId && { previous_response_id: previousId }),
            ...(capabilities.webSearch && { tools: [{ type: "web_search_preview" }] })
        };

        await fetchResponsesApi(apiKey, requestBody);

    } else {
        console.error(`Effective model "${finalModel}" routing not implemented.`);
        showNotification(`Model "${finalModel}" routing not implemented.`, 'error');
    }
}

/**
 * Fetches an image from DALL-E 3.
 * @param {string} apiKey
 * @param {string} prompt
 * @returns {Promise<{imageUrl: string, revisedPrompt: string | null} | null>}
 */
async function fetchImageGeneration(apiKey, prompt) {
    console.log("Calling DALL-E 3 for prompt:", prompt);
    const requestBody = {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024", // Or make configurable later
        quality: "standard", // Or "hd"
        response_format: "url", // Easier for direct display
    };

    try {
        showTypingIndicator("Generating image...");
        const response = await fetch(IMAGE_GENERATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        removeTypingIndicator();

        if (!response.ok) {
            let errorMsg = `DALL-E Error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error?.message || errorMsg;
                console.error("DALL-E API Error:", errorData);
            } catch (e) { console.error("Failed to parse DALL-E error response:", e); }
            if (response.status === 401) errorMsg = "Authentication Error: Invalid API Key for DALL-E.";
            if (response.status === 429) errorMsg = "Rate Limit Exceeded for DALL-E.";
            if (response.status === 400) { // Often content policy violation
                errorMsg = `Invalid Request for DALL-E (Check prompt/content policy): ${errorMsg}`;
            }
            showNotification(errorMsg, 'error', 7000);
            return null;
        }

        const result = await response.json();
        if (result.data && result.data.length > 0 && result.data[0].url) {
            console.log("DALL-E Generation Successful:", result.data[0].url);
            return {
                imageUrl: result.data[0].url,
                revisedPrompt: result.data[0].revised_prompt || null
            };
        } else {
            console.error("DALL-E response missing expected data:", result);
            showNotification("Received unexpected response from DALL-E.", "error");
            return null;
        }
    } catch (error) {
        removeTypingIndicator();
        console.error('Network or other error during DALL-E API call:', error);
        showNotification(`Failed to generate image: ${error.message}`, 'error');
        return null;
    }
}

// --- TTS Function ---
/**
 * Fetches synthesized speech audio from OpenAI TTS API.
 */
export async function fetchSpeech(text, voice = 'alloy', format = 'mp3', instructions = null) {
    const apiKey = state.getApiKey();
    if (!apiKey) {
        showNotification("Error: API key is not set. Cannot synthesize speech.", 'error');
        return null;
    }
    if (!text || !text.trim()) {
        console.warn("fetchSpeech called with empty text.");
        return null;
    }
    console.log(`Requesting speech synthesis... Voice: ${voice}, Format: ${format}`);
    const bodyPayload = {
        model: "gpt-4o-mini-tts",
        input: text,
        voice: voice,
        response_format: format,
        ...(instructions && { instructions: instructions })
    };
    try {
        const response = await fetch(TTS_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
        });
        if (!response.ok) {
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try { const errorData = await response.json(); errorMsg = errorData.error?.message || errorMsg; console.error("TTS API Error Response:", errorData); }
            catch (parseError) { console.error("Failed to parse TTS API error response:", parseError); errorMsg = `TTS request failed with status ${response.status}. Could not parse error detail.`; }
            if (response.status === 401) errorMsg = "Authentication Error: Invalid API Key for TTS.";
            else if (response.status === 429) errorMsg = "Rate Limit Exceeded for TTS.";
            else if (response.status === 400) errorMsg = `Invalid Request for TTS: ${errorMsg}`;
            showNotification(`Speech Synthesis Error: ${errorMsg}`, 'error', 5000);
            return null;
        }
        const audioBlob = await response.blob();
        console.log(`Speech synthesis successful. Received audio blob (Type: ${audioBlob.type}, Size: ${audioBlob.size} bytes)`);
        return audioBlob;
    } catch (error) {
        console.error('Network or other error during TTS API call:', error);
        showNotification(`Failed to synthesize speech: ${error.message}`, 'error');
        return null;
    }
}


// --- Helper Functions to construct payloads ---

// Correct for Chat Completions (o3-mini)
function buildMessagesPayload(history, systemPrompt, knowledgeContent) {
    let payload = [];
    if (systemPrompt) {
        payload.push({ role: "system", content: systemPrompt });
    }
    let historyCopy = history.map(m => ({ ...m }));
    if (knowledgeContent && historyCopy.length > 0) {
        const lastUserIndex = historyCopy.findLastIndex(m => m.role === 'user');
        if (lastUserIndex !== -1) {
            historyCopy[lastUserIndex].content = knowledgeContent + "\n\n" + historyCopy[lastUserIndex].content;
            console.log("Knowledge content prepended to last user message for Chat Completions.");
        } else { console.warn("Could not find user message to prepend knowledge to."); }
    }
    payload = payload.concat(historyCopy);
    return payload;
}

/**
 * <<< MODIFIED >>>
 * Builds the 'input' array for Responses API.
 * Prepends system prompt and knowledge content to the user message content.
 * Correctly formats image content using 'image_url' as a STRING containing the Data URL.
 * Returns null on failure.
 */
function buildResponsesApiInput(lastUserMessageEntry, image, knowledgeContent, systemPrompt) {
    let inputPayload = [];
    let contentArray = []; // Holds parts of the user message content
    const userContent = lastUserMessageEntry?.content || "";

    // --- >>> CHECK AND INJECT LAST GENERATED IMAGE URL <<< ---
    const imageUrlToInject = state.getLastGeneratedImageUrl();
    if (imageUrlToInject) {
        console.log("Injecting last generated image URL into user message content (as input_image).");
        contentArray.push({
            type: "input_image", // <<< CORRECT TYPE for /v1/responses API
            image_url: imageUrlToInject
        });
        // --- >>> CLEAR THE STATE IMMEDIATELY AFTER USE <<< ---
        state.clearLastGeneratedImageUrl();
    }
    // --- >>> END INJECTION <<< ---

    // --- Combine all text content for the user message ---
    let combinedUserContent = userContent;
    if (knowledgeContent) {
        combinedUserContent = knowledgeContent + "\n\n" + combinedUserContent;
        console.log("Knowledge content prepended to user message for Responses API.");
    }
    if (systemPrompt) {
        combinedUserContent = systemPrompt + "\n\n" + combinedUserContent;
        console.log("System prompt prepended to user message content for Responses API.");
    }
    // --- End Combination ---

    // --- Add text part to content array (if exists) ---
    if (combinedUserContent) {
        contentArray.push({
            type: "input_text",
            text: combinedUserContent
        });
    }

    // --- Add image part to content array (if exists) ---
    if (image && image.data) {
        try {
            // Basic validation that it looks like a data URL
            if (!image.data.startsWith('data:image/')) {
                throw new Error("Invalid image data format provided to buildResponsesApiInput. Expected 'data:image/...'");
            }

            // <<< CORRECTED STRUCTURE based on error messages >>>
            contentArray.push({
                type: "input_image",
                image_url: image.data // Assign the full Data URL string directly
            });
            console.log(`Image included in user message content array for Responses API using image_url string.`);

            // <<< FIX: Clear image state *after* successfully incorporating data >>>
            state.clearCurrentImage(); // <--- ADD THIS LINE BACK
            // UI clearing (removeImagePreview) is handled separately in chatInput.js

        } catch (error) {
            console.error("Error processing image for API payload:", error);
            showNotification("Error preparing image data for API. Please try again.", "error");
            return null; // Indicate payload creation failed
        }
    }
    // --- End Image Part ---

    // --- Build the final message object ---
    if (contentArray.length > 0) {
        inputPayload.push({
            type: "message",
            role: "user",
            content: contentArray // Content is always an array if image or text exists
        });
    } else {
        console.warn("buildResponsesApiInput: No text or valid image data to send. Payload empty.");
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
            if (finalRawText) { const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml); state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText); }
            else if (streamStarted) { finalizeAIMessageContent(aiMessageElement, "[Empty Response]"); state.addMessageToHistory({ role: "assistant", content: "" }); setupMessageActions(aiMessageElement, ""); }
        } else if (streamStarted && !accumulatedContent) { showNotification("Received an empty response from the AI.", 'info'); }
        else if (!streamStarted) { console.log("Chat completions stream ended without any content delta."); }
    } catch (error) {
        console.error('Error during Chat Completions API call:', error); removeTypingIndicator();
        if (!error.message.startsWith('HTTP error') && !error.message.startsWith('Authentication Error') && !error.message.startsWith('Rate Limit Exceeded') && !error.message.startsWith('Context length exceeded')) { showNotification(`An unexpected error occurred: ${error.message}`, 'error'); }
        streamEnded = true;
    } finally {
        if (!streamEnded && aiMessageElement) {
            console.warn("Stream ended unexpectedly, finalizing with accumulated content."); const finalRawText = getAccumulatedRawText(); const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml);
            if (finalRawText) state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText);
        }
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

            if (delta?.content) {
                if (!streamStarted) {
                    removeTypingIndicator();
                    aiMessageElement = createAIMessageContainer();
                    if (!aiMessageElement) throw new Error("UI container creation failed.");
                    streamStarted = true;
                }
                currentAccumulatedContent = true;
                const escapedChunk = accumulateChunkAndGetEscaped(delta.content);
                if (aiMessageElement && escapedChunk) {
                    appendAIMessageContent(aiMessageElement, escapedChunk);
                }
            }

            if (finishReason) {
                console.log("Chat Completions Stream finished with reason:", finishReason);
                if (!streamStarted) removeTypingIndicator();
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
        console.log("Sending API Request (Responses API):", JSON.stringify(requestBody, null, 2));
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
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (buffer.trim()) {
                    const result = processResponsesEvent(buffer, aiMessageElement, lastItemId, streamHasContent);
                    if (result) { if (result.aiMessageElement) aiMessageElement = result.aiMessageElement; if (result.lastItemId) lastItemId = result.lastItemId; if (result.streamHasContent !== undefined) streamHasContent = result.streamHasContent; if (result.finalResponseId) finalResponseId = result.finalResponseId; if (result.streamEnded) streamEnded = true; }
                }
                streamEnded = true; break;
            }
            buffer += decoder.decode(value, { stream: true });
            let newlineIndex; const eventDelimiter = '\n\n';
            while ((newlineIndex = buffer.indexOf(eventDelimiter)) !== -1) {
                const eventBlock = buffer.slice(0, newlineIndex); buffer = buffer.slice(newlineIndex + eventDelimiter.length);
                const lines = eventBlock.split('\n');
                for (const line of lines) {
                    const result = processResponsesEvent(line, aiMessageElement, lastItemId, streamHasContent);
                    if (result) { if (result.aiMessageElement) aiMessageElement = result.aiMessageElement; if (result.lastItemId) lastItemId = result.lastItemId; if (result.streamHasContent !== undefined) streamHasContent = result.streamHasContent; if (result.finalResponseId) finalResponseId = result.finalResponseId; if (result.streamEnded) streamEnded = true; }
                }
            }
        }
        removeTypingIndicator();
        if (finalResponseId) { state.setPreviousResponseId(finalResponseId); console.log("Responses API stream finished. Final Response ID:", finalResponseId); }
        else { console.warn("Responses API stream finished but no final response ID received in completed event."); }
        if (aiMessageElement) {
            const finalRawText = getAccumulatedRawText();
            if (streamHasContent) { const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml); state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText); }
            else { finalizeAIMessageContent(aiMessageElement, "[AI responded without text content]"); state.addMessageToHistory({ role: "assistant", content: "" }); setupMessageActions(aiMessageElement, ""); console.log("Stream completed, AI message container exists but received no text deltas."); }
        } else if (streamHasContent) {
            console.error("Stream had content but UI element was missing at the end.");
            aiMessageElement = createAIMessageContainer();
            if (aiMessageElement) { const finalRawText = getAccumulatedRawText(); const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml); state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText); }
        } else { console.log("Stream completed without generating any message item or text content."); }
    } catch (error) {
        console.error('Error during Responses API call:', error); removeTypingIndicator();
        streamEnded = true;
    } finally {
        if (!streamEnded && aiMessageElement) {
            console.warn("Stream ended unexpectedly (Responses API), finalizing with accumulated content."); const finalRawText = getAccumulatedRawText(); const finalHtml = parseFinalHtml(); finalizeAIMessageContent(aiMessageElement, finalHtml);
            if (finalRawText) state.addMessageToHistory({ role: "assistant", content: finalRawText }); setupMessageActions(aiMessageElement, finalRawText);
        }
    }
}


/**
 * Processes a single event line from the Responses API stream.
 */
function processResponsesEvent(line, aiMessageElement, lastItemId, streamHasContent) {
    let updatedAiMessageElement = aiMessageElement;
    let updatedLastItemId = lastItemId;
    let updatedStreamHasContent = streamHasContent;
    let finalResponseId = null;
    let isStreamEndEvent = false;

    if (line.startsWith('event: ')) { /* Ignore event line */ }
    else if (line.startsWith('data: ')) {
        const data = line.substring(5).trim();
        if (data === '[DONE]') { console.log("Received [DONE] signal."); isStreamEndEvent = true; return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, finalResponseId, streamEnded: true }; }
        try {
            const parsed = JSON.parse(data); const eventType = parsed.type;
            if (eventType === 'response.created') { removeTypingIndicator(); console.log("Response Created Event:", parsed.response?.id); }
            else if (eventType === 'response.tool_use.started' && parsed.tool_use?.type === 'web_search_preview') { console.log("Web search started..."); showTypingIndicator("Searching the web..."); }
            else if (eventType === 'response.tool_use.output' && parsed.tool_use?.type === 'web_search_preview') { console.log("Web search finished."); showTypingIndicator("Thinking..."); }
            else if (eventType === 'response.tool_use.failed' && parsed.tool_use?.type === 'web_search_preview') { console.error("Web search failed:", parsed.error); showTypingIndicator("Thinking..."); showNotification("Web search failed to complete.", "warning"); }
            else if (eventType === 'response.output_item.added' && parsed.item?.type === 'message') {
                if (!updatedAiMessageElement) { updatedAiMessageElement = createAIMessageContainer(); updatedLastItemId = parsed.item?.id; if (!updatedAiMessageElement) throw new Error("UI container creation failed."); console.log("AI message container created for item ID:", updatedLastItemId); }
            }
            else if (eventType === 'response.output_text.delta' && parsed.item_id === updatedLastItemId) {
                if (parsed.delta) {
                    updatedStreamHasContent = true;
                    if (!updatedAiMessageElement) { console.error("Received text delta but AI message element doesn't exist!"); updatedAiMessageElement = createAIMessageContainer(); if (!updatedAiMessageElement) throw new Error("UI container creation failed (defensive)."); }
                    const escapedChunk = accumulateChunkAndGetEscaped(parsed.delta);
                    if (updatedAiMessageElement && escapedChunk) { appendAIMessageContent(updatedAiMessageElement, escapedChunk); }
                }
            }
            else if (eventType === 'response.completed' || eventType === 'response.failed' || eventType === 'response.incomplete') {
                isStreamEndEvent = true; removeTypingIndicator(); console.log("Responses API Stream Finish Event:", eventType, parsed.response);
                if (parsed.response?.id) { finalResponseId = parsed.response.id; }
                if (eventType === 'response.failed') { showNotification(`AI response failed: ${parsed.error?.message || 'Unknown reason'}`, 'error'); }
                else if (eventType === 'response.incomplete') { showNotification(`AI response may be incomplete: ${parsed.reason || 'Unknown reason'}`, 'warning'); }
            }
            return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, finalResponseId, streamEnded: isStreamEndEvent };
        } catch (e) {
            removeTypingIndicator(); console.error('Error parsing Responses API stream chunk or handling event:', data, e);
            if (updatedAiMessageElement) appendAIMessageContent(updatedAiMessageElement, escapeHTML("\n\n[Error processing response stream]"));
            return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, finalResponseId: null, streamEnded: true };
        }
    }
    return { aiMessageElement: updatedAiMessageElement, lastItemId: updatedLastItemId, streamHasContent: updatedStreamHasContent, finalResponseId, streamEnded: false };
}