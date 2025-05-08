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
// Import Supabase client for authentication
import { supabase } from './supabaseClient.js';
// Import marked for Grok reasoning parsing
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";


// API Endpoints
const CHAT_COMPLETIONS_API_URL = 'https://api.openai.com/v1/chat/completions';
const RESPONSES_API_URL = 'https://api.openai.com/v1/responses';
const TTS_API_URL = 'https://api.openai.com/v1/audio/speech';
// const IMAGE_GENERATION_API_URL = 'https://api.openai.com/v1/images/generations'; // Removed, not used
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

export async function callImageGenerationFunction(prompt) {
    console.log(`Calling photo generation function via Supabase Edge Function.`);

    // Format the request according to the edge function's expected format
    // The edge function expects: prompt, width, height, steps, output_format, response_format
    const body = {
        prompt: prompt,
        width: 1024,
        height: 1024,
        steps: 30,
        output_format: "png",
        response_format: "b64_json"
    };

    console.log("Request body for photo generation:", JSON.stringify(body, null, 2));

    // Note: The new photo-gen endpoint doesn't support image editing
    // If this functionality is needed in the future, it will need to be implemented

    try {
        // Use Supabase client to call the edge function
        // This will automatically handle the JWT authentication
        const { data, error: supabaseError } = await supabase.functions.invoke('photo-gen', {
            body: body
        });

        console.log("Photo generation response:", data);

        if (supabaseError) {
            console.error("Supabase function error:", supabaseError);
            throw new Error(supabaseError.message || "Failed to call photo generation service");
        }

        if (data && data.error) {
            console.error("Error returned from photo generation service:", data.error);
            throw new Error(data.error);
        }

        // The service returns data in the same format with b64_json
        if (!data || !data.b64_json) {
            console.error("Invalid response from photo generation service:", data);
            throw new Error("Photo generation service returned invalid data");
        }

        return data;
    } catch (error) {
        console.error("Error calling photo generation service:", error);
        throw error;
    }
}

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
 * @param {object} lastUserMessageEntry - The last user message object.
 */
export async function routeApiCall(selectedModelSetting, useWebSearch, lastUserMessageEntry) {
    const activeConfig = state.getActiveCustomGptConfig();
    const history = state.getChatHistory();
    const isImageGenMode = state.getIsImageGenerationMode();
    const apiKey = state.getApiKey();

    // --- Determine effective settings based on activeConfig ---
    let finalModel = selectedModelSetting;
    let finalSystemPrompt = null;
    let knowledgeContent = "";
    let capabilities = { webSearch: useWebSearch };

    // The lastUserMessageEntry is now passed directly as a parameter.
    // const lastUserMessageEntry = history.filter(m => m.role === 'user').pop(); // Removed

    // Early validation
    if (!lastUserMessageEntry) { // Modified validation
        console.error("Cannot call API: User message object not provided.");
        showNotification("An internal error occurred: User message data is missing.", 'error');
        return;
    }

    // Handle image generation mode first
    if (isImageGenMode) {
        console.log(`Routing to photo generation service via Supabase Edge Function`);

        // Check if Supabase client is available
        if (!supabase) {
            console.error("Supabase client is not available. Cannot call Edge Function.");
            showNotification("Error: Supabase client not initialized. Cannot generate image.", 'error');
            return;
        }

        // Clear previous image URL state immediately
        state.clearLastGeneratedImageUrl();
        const aiMessageElement = createAIMessageContainer(); // Create container
        if (!aiMessageElement) {
            console.error("Failed to create AI message container for placeholder.");
            showNotification("Error displaying image placeholder.", 'error');
            return;
        }

        // Add placeholder class
        aiMessageElement.classList.add('image-placeholder');
        showChatInterface(); // Ensure chat is visible

        try {
            // Get the prompt from the last user message
            const prompt = lastUserMessageEntry.content;

            console.log("Sending photo generation prompt:", prompt);

            // Call the photo generation function
            const result = await callImageGenerationFunction(prompt);

            // Remove placeholder class
            if (aiMessageElement) aiMessageElement.classList.remove('image-placeholder');

            // Check for the image data in the response
            if (result && result.b64_json) {
                // Construct data URL from base64 string
                const imageUrl = `data:image/png;base64,${result.b64_json}`;

                console.log("Image generated successfully via photo generation service.");

                // Construct final content
                let finalContent = `<img src="${imageUrl}" alt="Generated image" style="max-width: 100%; border-radius: 6px; display: block; margin-top: 8px;">`;

                // Finalize the content (this will replace the placeholder)
                finalizeAIMessageContent(aiMessageElement, finalContent, false); // Pass false for markdown processing
                console.log("Image content finalized, replacing placeholder.");

                // Setup actions with the image URL (base64 data URL works here)
                setupMessageActions(aiMessageElement, imageUrl, true);
                console.log("Image actions set up.");

                // Add to history with the image URL
                console.log("Adding image message to history...");
                state.addMessageToHistory({
                    role: 'assistant',
                    content: '[Generated Image]', // Content can be minimal or indicate it's an image
                    generatedImageUrl: imageUrl // Use generatedImageUrl here
                });
                console.log("Image message added to history.");

            } else {
                // Handle cases where the function executed but didn't return expected data
                console.error("Invalid response structure from image generation (missing b64_json):", result);
                throw new Error("Image generation returned invalid data structure.");
            }

        } catch (error) { // Catches errors thrown above
            // Remove placeholder class if still present
            if (aiMessageElement && aiMessageElement.classList.contains('image-placeholder')) {
                 aiMessageElement.classList.remove('image-placeholder');
            }

            // Catch network errors calling the function or errors thrown above
            console.error("Error during photo generation:", error);
            const errorHtml = `<p class="error-message">Error generating photo: ${escapeHTML(error.message || 'Unknown error')}</p>`;

            // Finalize with error message (this replaces the placeholder)
            if (aiMessageElement) {
                finalizeAIMessageContent(aiMessageElement, errorHtml, false); // Pass false for markdown
            } else {
                 console.error("Cannot display error in chat, AI message container does not exist.");
            }

            showNotification(`Error generating photo: ${error.message || 'Please check console for details.'}`, 'error');

            // Add error message to history
            state.addMessageToHistory({
                role: 'assistant',
                content: `[Error generating photo: ${error.message || 'Unknown error'}]`
            });
        }
        return; // Stop further processing after handling image generation
    }

    // --- End Handling Image Generation ---

    // Configure based on active Custom GPT
    if (activeConfig) {
        console.log(`Using Custom GPT Config: "${activeConfig.name}"`);
        finalSystemPrompt = activeConfig.instructions || null;
        if (activeConfig.knowledgeFiles?.length > 0) {
            knowledgeContent = activeConfig.knowledgeFiles
                .filter(kf => kf.content && !kf.error)
                .map(kf => `--- START Knowledge: ${kf.name} ---\n${kf.content}\n--- END Knowledge: ${kf.name} ---`)
                .join('\n\n');
        }
        if (activeConfig.capabilities?.webSearch !== undefined) {
            capabilities.webSearch = activeConfig.capabilities.webSearch;
        }
    }

    // When web search is enabled, we'll use GPT-4.1 to handle the complete response
    // No additional model calls will be made after web search
    if (capabilities.webSearch) {
        console.log("Web search requested - Using GPT-4.1 to handle the complete response");

        if (!apiKey) {
            showNotification("Error: API key is required for web search.", 'error');
            return;
        }

        // Use gpt-4.1 for web search as per the latest API documentation
        // This will handle both the search AND the response
        const webSearchRequestBody = {
            model: "gpt-4.1",
            input: buildResponsesApiInput(lastUserMessageEntry, knowledgeContent, finalSystemPrompt),
            stream: true,
            tools: [{
                type: "web_search_preview",
                search_context_size: "medium" // Default to medium context size (balanced context, cost, and latency)
            }],
            tool_choice: { type: "web_search_preview" } // Force the use of web search for more consistent results
        };

        console.log("Using gpt-4.1 for web search and response, regardless of selected model:", finalModel);

        try {
            await fetchResponsesApi(apiKey, webSearchRequestBody, true);

            // Reset the web search toggle after processing
            state.setIsWebSearchEnabled(false);
            console.log("Web search toggle reset after processing");

            // Return early - no need to call any other model
            return;

        } catch (error) {
            console.error("Web search failed:", error);
            showNotification("Web search failed, continuing with base model response", 'warning');
            // Continue with normal model call if web search fails
        }
    }

    // Now proceed with the main model call (existing code for different model types)
    if (finalModel.startsWith('gemini-')) {
        console.log(`Routing to Gemini API for model: ${finalModel}`);
        const geminiApiKey = state.getGeminiApiKey();
        if (!geminiApiKey) {
            showNotification("Error: Google Gemini API key is required for Gemini models. Please add it in Settings.", 'error');
            return;
        }

        // Build Gemini Payloads using helpers
        const geminiContents = buildGeminiPayloadContents(state.getChatHistory(), null); // Pass history, System prompt handled separately
        const geminiSystemInstruction = buildGeminiSystemInstruction(finalSystemPrompt);
        const geminiGenerationConfig = buildGeminiGenerationConfig();

        // Inject knowledge content into the last user message's text part within geminiContents
        if (knowledgeContent && geminiContents && geminiContents.length > 0) {
            const lastContent = geminiContents[geminiContents.length - 1];
            if (lastContent.role === 'user' && lastContent.parts) {
                const textPart = lastContent.parts.find(p => p.text !== undefined);
                if (textPart) {
                    textPart.text = knowledgeContent + "\n\n" + (textPart.text || '');
                    console.log("Knowledge content prepended to last user message for Gemini.");
                } else {
                    // If no text part exists (e.g., image-only message), add one
                    lastContent.parts.unshift({ text: knowledgeContent });
                    console.log("Knowledge content added as new text part to last user message for Gemini.");
                }
            } else {
                console.warn("Could not find suitable last user message part to prepend knowledge to for Gemini.");
            }
        }

        if (!geminiContents) {
            showNotification("Failed to prepare message data for Gemini API.", "error");
            return;
        }

        // Call the Gemini fetch function
        await fetchGeminiStream(
            geminiApiKey,
            finalModel, // Pass the specific model name
            geminiContents,
            geminiSystemInstruction,
            geminiGenerationConfig
        );
        // Gemini call handles its own UI updates via messageList functions

    } else if (finalModel === 'o3-mini-high') {
        console.log("Routing to Chat Completions API for o3-mini");
        if (!apiKey) {
            showNotification("Error: OpenAI API key is required. Please add it in Settings.", 'error');
            return;
        }
        // Pass the specific last user message entry for modification if needed
        const messagesPayload = buildMessagesPayload(history, finalSystemPrompt, knowledgeContent);
        state.setPreviousResponseId(null);
        await fetchChatCompletions(apiKey, messagesPayload);

    } else if (finalModel.startsWith('grok-')) {
        console.log(`Routing to Grok API for model: ${finalModel}`);
        // Get X.AI API key for Grok models
        const xaiApiKey = state.getXaiApiKey();
        if (!xaiApiKey) {
            showNotification("Error: X.AI API key is required for Grok models. Please add it in Settings.", 'error');
            return;
        }

        // Add a special system prompt for Grok when web search results are present
        let grokSystemPrompt = finalSystemPrompt;
        const hasWebSearchResults = history.some(msg => msg.isWebSearchResult);

        if (hasWebSearchResults) {
            grokSystemPrompt = (grokSystemPrompt ? grokSystemPrompt + "\n\n" : "") +
                "You might see web search results embedded in the chat history as system messages.\n" +
                "These messages contain factual, up-to-date content retrieved from the web.\n\n" +
                "Treat any such results as accurate and authoritative.\n" +
                "Do not contradict, question, or rely on your own knowledge if it conflicts with them.\n" +
                "Always defer to the web search content when forming your response.";
        }

        // Grok models use Chat Completions API format but with different endpoint
        const messagesPayload = buildMessagesPayload(history, grokSystemPrompt, knowledgeContent);
        const requestBody = {
            model: finalModel,
            messages: messagesPayload,
            stream: true,
            reasoning: true // Request reasoning content
            // Use high reasoning effort only for grok-3-mini if needed
            // ...(finalModel === 'grok-3-mini-beta' && { reasoning_effort: 'high' })
        };

        await fetchGrokCompletions(xaiApiKey, requestBody);
    } else {
        // Handle other OpenAI models (GPT-4o, etc.)
        console.log(`Routing to Responses API for model: ${finalModel}`);
        if (!apiKey) {
            showNotification("Error: OpenAI API key is required. Please add it in Settings.", 'error');
            return;
        }

        // Add a special system prompt for OpenAI models when web search results are present
        let openAISystemPrompt = finalSystemPrompt;
        const hasWebSearchResults = history.some(msg => msg.isWebSearchResult);

        if (hasWebSearchResults) {
            openAISystemPrompt = (openAISystemPrompt ? openAISystemPrompt + "\n\n" : "") +
                "You might see web search results embedded in the chat history as system messages.\n" +
                "These messages contain factual, up-to-date content retrieved from the web.\n\n" +
                "Treat any such results as accurate and authoritative.\n" +
                "Do not contradict, question, or rely on your own knowledge if it conflicts with them.\n" +
                "Always defer to the web search content when forming your response.";
        }

        // Update finalSystemPrompt with the enhanced version
        finalSystemPrompt = openAISystemPrompt;

        const previousId = state.getPreviousResponseId();
        // Only include temperature for models that support it
        const supportsTemperature = (
            finalModel === 'gpt-4o' ||
            finalModel === 'gpt-4.1' ||
            finalModel === 'gpt-4.5-preview' ||
            finalModel.startsWith('gpt-4')
        );
        const requestBody = {
            model: finalModel, // Use the selected/active model directly
            input: buildResponsesApiInput(lastUserMessageEntry, knowledgeContent, finalSystemPrompt),
            stream: true,
            ...(supportsTemperature ? { temperature: 0.8 } : {}),
            ...(previousId && { previous_response_id: previousId }),
            ...(capabilities.webSearch && { tools: [{ type: "web_search_preview" }] })
        };

        await fetchResponsesApi(apiKey, requestBody);
    }
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
        const requestBody = {
            model: 'tts-1',
            input: instructions ? `${instructions}\n\n${text}` : text,
            voice: voice,
            response_format: format
        };

        const response = await fetch(TTS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: "Failed to parse error response." } }));
            console.error("TTS API Error Response:", errorData);
            let errorMessage = errorData.error?.message || `HTTP error! Status: ${response.status}`;
            if (response.status === 401) {
                errorMessage = "Authentication Error: Invalid API Key.";
            }
            showNotification(`Error: ${errorMessage}`, 'error', 5000);
            throw new Error(errorMessage);
        }

        // Get the audio data as a blob
        const audioBlob = await response.blob();
        return audioBlob;

    } catch (error) {
        console.error('Error fetching speech:', error);
        throw error;
    }
}


// --- Helper Functions to construct payloads ---

// Correct for Chat Completions (o3-mini, Grok)
function buildMessagesPayload(history, systemPrompt, knowledgeContent) {
    let payload = [];
    if (systemPrompt) {
        payload.push({ role: "system", content: systemPrompt });
    }

    // Create a copy of history, preserving all messages including web search results
    let historyCopy = history.map(m => {
        // Always include role and content
        const messageCopy = { role: m.role, content: m.content };

        // Log web search results for debugging
        if (m.isWebSearchResult) {
            console.log("Including web search result in message payload:", m.content.substring(0, 100) + "...");
        }

        return messageCopy;
    });

    // Ensure web search results are correctly positioned in the history
    // They should appear before the last user message and the assistant's response

    if (knowledgeContent && historyCopy.length > 0) {
        const lastUserIndex = historyCopy.findLastIndex(m => m.role === 'user');
        if (lastUserIndex !== -1) {
            historyCopy[lastUserIndex].content = knowledgeContent + "\n\n" + (historyCopy[lastUserIndex].content || ''); // Prepend knowledge
            console.log("Knowledge content prepended to last user message for Chat Completions/Grok.");
        } else { console.warn("Could not find user message to prepend knowledge to."); }
    }

    payload = payload.concat(historyCopy);

    // Log the final payload for debugging
    console.log("Final message payload for Grok/Chat Completions:",
        payload.map(m => ({ role: m.role, contentLength: m.content?.length || 0 })));

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
            if (webSearchResults) processWebSearchResults(webSearchResults, aiMessageElement); // Render pending results if any
            const finalRawText = getAccumulatedRawText();
            const finalHtml = parseFinalHtml();
            finalizeAIMessageContent(aiMessageElement, finalHtml || (webSearchResults ? "" : "[Incomplete Response]"), !!webSearchResults);

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
            // Handle web search events according to latest API format
            else if (parsed.type === 'web_search_call' && parsed.status === 'completed') {
                console.log("Web search completed with ID:", parsed.id);
                showTypingIndicator("Processing search results...");
            }
            else if (parsed.type === 'web_search_call' && parsed.status === 'in_progress') {
                console.log("Web search in progress...");
                showTypingIndicator("Searching the web...");
            }
            else if (parsed.type === 'message' && parsed.content && parsed.content[0]?.type === 'output_text') {
                // Check if this message contains web search results (has annotations)
                if (parsed.content[0].annotations && parsed.content[0].annotations.length > 0) {
                    console.log("Received message with web search results and citations");

                    // Extract and format web search results from annotations
                    const citations = parsed.content[0].annotations.filter(a => a.type === 'url_citation');
                    if (citations.length > 0) {
                        // Create a structured format for our web search results
                        updatedWebSearchResults = {
                            query: lastUserMessageEntry?.content || 'Web Search',
                            results: citations.map(citation => ({
                                title: citation.title || 'Web Result',
                                url: citation.url,
                                content: parsed.content[0].text.substring(citation.start_index, citation.end_index)
                            }))
                        };

                        showTypingIndicator("Thinking..."); // Change back to thinking
                    }
                }
            }
            else if (eventType === 'response.tool_use.failed' && parsed.tool_use?.type === 'web_search_preview') {
                console.error("Web search failed:", parsed.error);
                showTypingIndicator("Thinking...");
                showNotification("Web search failed to complete.", "warning");
            }
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
 * Updated to handle the latest OpenAI Responses API format with citations.
 */
function processWebSearchResults(data, messageElement) {
    if (!data || !messageElement) {
        console.warn("processWebSearchResults called with invalid data or message element");
        return;
    }

    console.log("Processing web search results:", {
        hasData: !!data,
        resultCount: data?.results?.length || 0,
        query: data?.query
    });

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

    // Format web search results to add to chat history as a system message
    const formattedResults = "--- Web Search Results ---\n" +
        searchData.results.map(r =>
            `[${r.title}]\n${r.url}\n${r.content}`
        ).join("\n\n") +
        "\n--- End Web Search Results ---";

    // Add search results as a system message in chat history so all models can see it
    const webSearchMessage = {
        role: 'system',
        content: formattedResults,
        isWebSearchResult: true  // Flag to identify this as web search results
    };

    state.addMessageToHistory(webSearchMessage);

    // Log the current state of chat history after adding web search results
    const currentHistory = state.getChatHistory();
    console.log(`Web search results added to chat history. Current history length: ${currentHistory.length}`);
    console.log("Web search message added:", {
        role: webSearchMessage.role,
        isWebSearchResult: webSearchMessage.isWebSearchResult,
        contentLength: webSearchMessage.content.length,
        contentPreview: webSearchMessage.content.substring(0, 100) + "..."
    });

    // Verify that the web search result is actually in the history
    const hasWebSearchResults = currentHistory.some(msg => msg.isWebSearchResult);
    console.log(`Chat history contains web search results: ${hasWebSearchResults}`);

    return webSearchMessage; // Return the message for potential use by caller
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
