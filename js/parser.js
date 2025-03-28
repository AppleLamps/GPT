// ===== FILE: js/parser.js =====
// MODIFIED: Separated accumulation and final parsing

// We'll use the 'marked' library. You need to include it in your HTML.
// Example CDN: <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

import { escapeHTML } from './utils.js'; // <<< Import escapeHTML

// Ensure marked is loaded before this script runs or handle potential errors.
if (typeof marked === 'undefined') {
    console.error("Marked library is not loaded. Please include it in your index.html");
    // You might want to throw an error or disable functionality here
}

let accumulatedRawText = ''; // Store the raw text for history

/**
 * <<< MODIFIED >>>
 * Appends a raw text chunk to the internal buffer and returns the *escaped* raw chunk.
 * Does NOT parse Markdown here.
 * @param {string} chunk - The raw text chunk received from the stream.
 * @returns {string} The raw, HTML-escaped text chunk that was just added. Returns empty string if chunk is empty.
 */
export function accumulateChunkAndGetEscaped(chunk) {
    if (chunk) {
        accumulatedRawText += chunk;
        // Return the escaped version of JUST the chunk for immediate display
        return escapeHTML(chunk);
    }
    return '';
}

/**
 * <<< NEW >>>
 * Parses the entire accumulated raw text using Marked.js.
 * @returns {string} The fully parsed HTML string.
 */
export function parseFinalHtml() {
    if (typeof marked === 'undefined') {
        console.error("Marked library not available for final parsing.");
        // Fallback: return escaped raw text
        return escapeHTML(accumulatedRawText);
    }
    // Use marked to parse the *entire* accumulated text.
    // Disable deprecated options for security/future-proofing
    return marked.parse(accumulatedRawText, {
        breaks: true, // Convert GFM line breaks to <br>
        gfm: true,    // Enable GitHub Flavored Markdown
        async: false  // Use synchronous parsing
    });
}


/**
 * Returns the total accumulated raw text.
 * @returns {string} The raw, unformatted text accumulated from all chunks.
 */
export function getAccumulatedRawText() {
    return accumulatedRawText;
}


/**
 * Resets the accumulated text for a new message stream.
 */
export function resetParser() {
    accumulatedRawText = '';
}