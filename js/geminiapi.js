// ===== FILE: js/geminiapi.js =====
import * as state from './state.js';
import { showTypingIndicator, removeTypingIndicator, createAIMessageContainer, appendAIMessageContent, finalizeAIMessageContent, setupMessageActions } from './components/messageList.js';
import { showNotification } from './notificationHelper.js';
import { resetParser, accumulateChunkAndGetEscaped, parseFinalHtml, getAccumulatedRawText } from './parser.js';
import { escapeHTML } from './utils.js';

// Constants
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

/**
 * Builds the 'contents' payload for the Gemini API request.
 * @param {Array} history - The chat history from state.js.
 * @param {string | null} systemPrompt - The system instruction text.
 * @returns {Array | null} The structured contents array or null on error.
 */
export function buildGeminiPayloadContents(history, systemPrompt) {
    console.log("Building Gemini 'contents' payload...");
    
    if (!history || !Array.isArray(history)) {
        console.error("Invalid history provided to buildGeminiPayloadContents");
        return [];
    }
    
    const contents = [];
    
    try {
        // Process each message in the history
        for (const message of history) {
            // Skip system messages (handled separately via system_instruction)
            if (message.role === 'system') continue;
            
            // Map OpenAI roles to Gemini roles
            const geminiRole = message.role === 'assistant' ? 'model' : 'user';
            
            // Create the message object with parts array
            const geminiMessage = {
                role: geminiRole,
                parts: []
            };
            
            // Add text content if present
            if (message.content && typeof message.content === 'string') {
                geminiMessage.parts.push({ text: message.content });
            }
            
            // Add image data if present
            if (message.imageData) {
                try {
                    // Extract the MIME type and raw base64 data
                    const match = message.imageData.match(/^data:image\/(jpeg|png|gif);base64,(.+)$/);
                    
                    if (match) {
                        const mimeType = `image/${match[1]}`;
                        const rawBase64Data = match[2];
                        
                        geminiMessage.parts.push({
                            inline_data: {
                                mime_type: mimeType,
                                data: rawBase64Data
                            }
                        });
                    } else {
                        console.warn("Image data is not in expected format, skipping image");
                    }
                } catch (error) {
                    console.error("Error processing image data for Gemini API:", error);
                    // Continue without the image part if there's an error
                }
            }
            
            // Only add the message if it has at least one part
            if (geminiMessage.parts.length > 0) {
                contents.push(geminiMessage);
            }
        }
        
        console.log(`Built Gemini contents payload with ${contents.length} messages`);
        return contents;
    } catch (error) {
        console.error("Error building Gemini payload contents:", error);
        return [];
    }
}

/**
 * Builds the 'generationConfig' object for the Gemini API request.
 * @returns {object}
 */
export function buildGeminiGenerationConfig() {
    // Basic configuration with sensible defaults
    return {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.95,
        topK: 64
    };
}

/**
 * Builds the 'system_instruction' object for the Gemini API request.
 * @param {string | null} systemPrompt
 * @returns {object | null}
 */
export function buildGeminiSystemInstruction(systemPrompt) {
    if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.trim() === '') {
        return null;
    }
    return {
        parts: [{ text: systemPrompt }]
    };
}

/**
 * Processes a single Server-Sent Event chunk from the Gemini stream.
 * @param {string} line - A line from the SSE stream (e.g., "data: {...}").
 * @param {HTMLElement | null} aiMessageElement - The current UI element being updated.
 * @param {boolean} streamHasContent - Flag indicating if any text has been received yet.
 * @returns {{aiMessageElement: HTMLElement | null, streamHasContent: boolean, streamEnded: boolean}}
 */
function processGeminiStreamEvent(line, aiMessageElement, streamHasContent) {
    let currentAiMessageElement = aiMessageElement;
    let currentStreamHasContent = streamHasContent;
    let streamEnded = false;

    // Only process lines that start with "data:"
    if (!line.startsWith('data:')) {
        return { aiMessageElement: currentAiMessageElement, streamHasContent: currentStreamHasContent, streamEnded: streamEnded };
    }

    // Extract the JSON part after "data:"
    const jsonString = line.substring(5).trim();
    
    // Skip if the line is "[DONE]" which sometimes indicates the end of the stream
    if (jsonString === '[DONE]') {
        console.log("Received [DONE] marker in Gemini stream");
        return { aiMessageElement: currentAiMessageElement, streamHasContent: currentStreamHasContent, streamEnded: true };
    }

    // Parse the JSON
    try {
        const parsed = JSON.parse(jsonString);
        
        // Debug: log the structure occasionally to help with development
        if (!currentStreamHasContent) {
            console.debug("First Gemini chunk structure:", JSON.stringify(parsed, null, 2));
        }

        // Extract the text chunk from the typical Gemini response structure
        const deltaText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        
        // Check if we have content to process
        if (deltaText !== undefined) {  // Note: we allow empty strings as valid chunks
            // Create a new message container if this is the first content
            if (!currentAiMessageElement) {
                removeTypingIndicator();
                currentAiMessageElement = createAIMessageContainer();
                if (!currentAiMessageElement) {
                    console.error("Failed to create AI message container");
                    return { 
                        aiMessageElement: null, 
                        streamHasContent: currentStreamHasContent, 
                        streamEnded: streamEnded 
                    };
                }
            }
            
            // Mark that we have content if this chunk is non-empty
            if (deltaText && !currentStreamHasContent) {
                currentStreamHasContent = true;
            }
            
            // Process the text through the parser
            const escapedChunk = accumulateChunkAndGetEscaped(deltaText);
            
            // Update the UI with the new content
            if (currentAiMessageElement && escapedChunk) {
                appendAIMessageContent(currentAiMessageElement, escapedChunk);
            }
        }
        
        // Check for finish reason
        const finishReason = parsed?.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED') {
            console.log(`Gemini stream finished with reason: ${finishReason}`);
            streamEnded = true;
        }
        
        // Check for safety ratings that may have blocked content
        const safetyRatings = parsed?.candidates?.[0]?.safetyRatings;
        if (safetyRatings) {
            const blockedCategories = safetyRatings
                .filter(rating => rating.probability === 'BLOCK')
                .map(rating => rating.category);
            
            if (blockedCategories.length > 0) {
                console.warn(`Gemini response blocked due to safety categories: ${blockedCategories.join(', ')}`);
                if (!currentStreamHasContent) {
                    // Only show notification if no content was generated before blocking
                    showNotification("Response blocked by Gemini's safety filters", "warning");
                }
                streamEnded = true;
            }
        }
        
        // Check for content filter blocked response 
        const contentFilterResults = parsed?.promptFeedback?.blockReason;
        if (contentFilterResults) {
            console.warn(`Gemini prompt blocked: ${contentFilterResults}`);
            showNotification(`Prompt blocked by Gemini's content filter: ${contentFilterResults}`, "warning");
            streamEnded = true;
        }

    } catch (error) {
        console.error("Error parsing Gemini stream chunk:", error, "Raw line:", line);
        // Don't end the stream on parse errors, as subsequent chunks might be valid
    }

    return { 
        aiMessageElement: currentAiMessageElement, 
        streamHasContent: currentStreamHasContent, 
        streamEnded: streamEnded 
    };
}

/**
 * Fetches a streaming response from the Gemini API.
 * @param {string} apiKey - The Gemini API key.
 * @param {string} modelName - The specific Gemini model ID (e.g., 'gemini-2.0-flash-exp').
 * @param {Array} contents - The conversation history/prompt payload.
 * @param {object | null} systemInstruction - The system instruction payload.
 * @param {object} generationConfig - Configuration for generation.
 */
export async function fetchGeminiStream(apiKey, modelName, contents, systemInstruction, generationConfig) {
    resetParser(); // Reset parser for new response
    showTypingIndicator();
    let aiMessageElement = null;
    let streamEnded = false;
    let streamHasContent = false;

    const fullUrl = `${API_BASE_URL}${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const requestBody = {
        contents,
        ...(systemInstruction && { system_instruction: systemInstruction }), // Add system instruction if present
        generationConfig,
    };

    console.log("Sending API Request (Gemini Stream):", fullUrl);
    console.log("Request Body:", JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            removeTypingIndicator();
            let errorMsg = `Gemini API Error (${response.status})`;
            let errorDetails = null;
            try {
                errorDetails = await response.json();
                console.error("Gemini Error Body:", errorDetails);
                // Extract message if available
                errorMsg = errorDetails?.error?.message || errorMsg;
            } catch (e) {
                console.error("Failed to parse Gemini error response body.");
                // Use status text if available and parsing fails
                errorMsg = `Gemini API Error (${response.status}${response.statusText ? ': ' + response.statusText : ''})`;
            }

            // Add specific checks for common error codes
            if (response.status === 400) {
                errorMsg = `Invalid Request to Gemini (400): ${errorMsg}`;
                // Check for safety blocks specifically
                if (errorDetails?.promptFeedback?.blockReason) {
                    errorMsg = `Request blocked by Gemini safety filters: ${errorDetails.promptFeedback.blockReason}`;
                }
                // Check for quota exceeded (can come as 400 error in Gemini)
                if (errorMsg.includes("quota") || errorMsg.includes("limit")) {
                    errorMsg = "Gemini API quota exceeded or rate limited. Please try again later.";
                }
            } else if (response.status === 401 || response.status === 403) {
                errorMsg = "Authentication Error: Invalid Google Gemini API Key.";
            } else if (response.status === 404) {
                if (errorMsg.includes("model")) {
                    errorMsg = `Model not found: "${modelName}" may not be available or may be incorrectly specified.`;
                } else {
                    errorMsg = `Resource not found: ${errorMsg}`;
                }
            } else if (response.status === 429) {
                errorMsg = "Rate Limit Exceeded for Gemini API.";
            } else if (response.status >= 500) {
                errorMsg = `Gemini Server Error (${response.status}): ${errorMsg}`;
            }

            showNotification(errorMsg, 'error', 7000); // Show longer duration for errors
            throw new Error(errorMsg); // Re-throw to ensure catch block below handles it
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
                console.log("Gemini stream reader marked done.");
                streamEnded = true;
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            // Process buffer line by line (SSE standard)
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (line.startsWith('data:')) {
                    const result = processGeminiStreamEvent(line, aiMessageElement, streamHasContent);
                     if (result) {
                        if (result.aiMessageElement) aiMessageElement = result.aiMessageElement;
                        if (result.streamHasContent !== undefined) streamHasContent = result.streamHasContent;
                        if (result.streamEnded) {
                            streamEnded = true;
                            // Break inner loop if stream ended signal received from processing
                           // break; // Removed break here, let outer loop finish
                        }
                    }
                } else if (line === '') {
                    // Empty line often separates SSE events, ignore
                } else {
                   // console.log("Received non-data line:", line); // Ignore other lines like 'event:' or comments ':'
                }
            }
             if (streamEnded) break; // Break outer loop if stream ended signal received
        } // end while(!streamEnded)

        // --- Finalization ---
        if (!streamHasContent && !streamEnded) {
             // If loop finished but no content and not explicitly ended (e.g., connection drop)
             console.warn("Gemini stream ended without receiving content or explicit end signal.");
             removeTypingIndicator();
        } else if (aiMessageElement) {
             // Finalize UI if content was received or stream ended normally
             const finalRawText = getAccumulatedRawText();
             const finalHtml = parseFinalHtml();
             finalizeAIMessageContent(aiMessageElement, finalHtml || "[Received empty response]");
             state.addMessageToHistory({ role: "model", content: finalRawText }); // Use 'model' role for Gemini
             setupMessageActions(aiMessageElement, finalRawText);
             console.log("Gemini stream processing complete.");
        } else {
             // Stream ended, but no UI element was ever created (e.g., error before first chunk)
             console.log("Gemini stream ended without creating a message element.");
             removeTypingIndicator();
        }


    } catch (error) {
        console.error('Error during Gemini API stream call:', error);
        removeTypingIndicator();
        
        // Avoid duplicate notification if error was already shown from the response.ok check
        if (!error.message.startsWith('Gemini API Error') && 
            !error.message.startsWith('Authentication Error') && 
            !error.message.startsWith('Rate Limit Exceeded') && 
            !error.message.startsWith('Request blocked')) {
            showNotification(`An unexpected error occurred: ${error.message}`, 'error');
        }
        
        streamEnded = true; // Ensure loop termination on error
    } finally {
        // Fallback finalization if something went wrong
         if (!streamEnded && aiMessageElement) {
             console.warn("Gemini stream ended unexpectedly, finalizing with accumulated content.");
             const finalRawText = getAccumulatedRawText();
             const finalHtml = parseFinalHtml();
             finalizeAIMessageContent(aiMessageElement, finalHtml);
             if (finalRawText) state.addMessageToHistory({ role: "model", content: finalRawText });
             setupMessageActions(aiMessageElement, finalRawText);
         }
         removeTypingIndicator(); // Ensure indicator is always removed
    }
}

/**
 * Fetches a deep research report from the Gemini API.
 * @param {string} apiKey - The Gemini API key.
 * @param {string} modelName - The specific Gemini model ID (e.g., 'gemini-2.5-pro-exp-03-25').
 * @param {string} reportPrompt - The detailed prompt for generating the research report.
 * @returns {Promise<string|null>} - The combined report text or null if there was an error.
 */
export async function fetchDeepResearch(apiKey, modelName, reportPrompt) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const reportSchema = {
    type: 'OBJECT',
    properties: {
      'Report_Title': { type: 'STRING', description: 'Fitting and descriptive title for the report.' },
      'Introduction_Scope': { type: 'STRING', description: 'Comprehensive introduction, scope, objectives, and significance.' },
      'Historical_Context_Background': { type: 'STRING', description: 'Relevant historical context, background, key developments, or foundational principles.' },
      'Key_Concepts_Definitions': { type: 'STRING', description: 'Detailed explanation of core concepts, terminology, and principles with examples.' },
      'Main_Analysis_Exploration': { type: 'STRING', description: 'Central section exploring 3-6 significant sub-themes in depth, including analysis, evidence, perspectives.' },
      'Current_State_Applications': { type: 'STRING', description: 'Current status, relevance, real-world applications, or manifestations.' },
      'Challenges_Perspectives_Criticisms': { type: 'STRING', description: 'Challenges, limitations, criticisms, controversies, or differing perspectives.' },
      'Future_Outlook_Trends': { type: 'STRING', description: 'Potential future developments, emerging trends, research directions, or long-term outlook.' },
      'Conclusion': { type: 'STRING', description: 'Synthesized key points, reiteration of significance, and final thoughts.' }
    },
    required: [
      'Report_Title',
      'Introduction_Scope',
      'Historical_Context_Background',
      'Key_Concepts_Definitions',
      'Main_Analysis_Exploration',
      'Current_State_Applications',
      'Challenges_Perspectives_Criticisms',
      'Future_Outlook_Trends',
      'Conclusion'
    ]
  };

  const requestBody = {
    contents: [{ parts: [{ text: reportPrompt }] }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: reportSchema,
      // Adjust temperature if needed, e.g., temperature: 0.7
    }
  };

  let controller;
  let timeoutId;
  try {
    controller = new AbortController();
    // Set timeout (e.g., 30 minutes = 1,800,000 ms)
    timeoutId = setTimeout(() => {
        console.warn('Deep research request timed out.');
        controller.abort('Request timed out');
    }, 1800000); // 30 minutes

    console.log("Sending deep research request to Gemini...");
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId); // Clear timeout if response received

    if (!response.ok) {
      let errorMsg = `API Error (${response.status})`;
      try {
        const errorData = await response.json();
        console.error('Gemini API Error Response:', errorData);
        errorMsg = errorData?.error?.message || errorMsg;
      } catch (e) {
        console.error('Failed to parse API error response.');
        errorMsg = `API Error (${response.status}): ${response.statusText || 'Unknown error'}`;
      }
      showNotification(`Deep Research failed: ${errorMsg}`, 'error', 7000);
      return null;
    }

    // Process successful response
    const responseData = await response.json();
    console.log("Deep research response received.");

    // Extract the nested JSON string (adjust path if needed based on actual API response structure)
    const nestedJsonString = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!nestedJsonString) {
      console.error('Could not find nested JSON text in Gemini response:', responseData);
      // Check for block reasons
      const blockReason = responseData?.promptFeedback?.blockReason;
      const finishReason = responseData?.candidates?.[0]?.finishReason;
      let reason = blockReason ? `Blocked: ${blockReason}` : (finishReason ? `Finished with reason: ${finishReason}` : 'Unexpected response structure');
      showNotification(`Deep research failed: ${reason}.`, 'error', 7000);
      return null;
    }

    // Parse the nested JSON string
    let reportJson;
    try {
      reportJson = JSON.parse(nestedJsonString);
    } catch (jsonError) {
      console.error('Failed to parse nested JSON from Gemini response:', jsonError, nestedJsonString);
      showNotification('Deep research failed: Invalid JSON format received from model.', 'error', 7000);
      return null;
    }

    console.log("Successfully parsed deep research JSON.");
    return reportJson; // Return the entire parsed JSON object

  } catch (error) {
    clearTimeout(timeoutId); // Ensure timeout is cleared on error too
    if (error.name === 'AbortError') {
        showNotification('Deep research request timed out after 30 minutes.', 'error', 7000);
    } else {
        console.error('Error during fetchDeepResearch:', error);
        showNotification(`Deep research request failed: ${error.message}`, 'error', 7000);
    }
    return null;
  }
} 