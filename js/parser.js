// ===== FILE: js/parser.js =====
/**
 * Optimized markdown parsing module 
 * Uses lazy-loading of marked library and caching for performance
 */
import { escapeHTML } from './utils.js';

// Cache for parsed content to avoid repeated parsing of the same content
const parseCache = new Map();
const MAX_CACHE_SIZE = 50; // Limit cache size to prevent memory issues

// Store accumulated content
let accumulatedRawText = '';

/**
 * Reset parser state for a new message stream
 */
export function resetParser() {
    accumulatedRawText = '';
}

/**
 * Check if marked library is available and log error only once
 */
let markedWarningShown = false;
function checkMarkedAvailability() {
    if (typeof marked === 'undefined') {
        if (!markedWarningShown) {
            console.error("Marked library is not loaded. Falling back to plain text.");
            markedWarningShown = true;
        }
        return false;
    }
    return true;
}

/**
 * Process incoming text chunk and return HTML-escaped version for immediate display
 * @param {string} chunk - Raw text chunk from stream
 * @returns {string} HTML-escaped chunk for display
 */
export function accumulateChunkAndGetEscaped(chunk) {
    if (!chunk) return '';
    
    accumulatedRawText += chunk;
    return escapeHTML(chunk);
}

/**
 * Get the complete raw accumulated text
 * @returns {string} Raw accumulated text
 */
export function getAccumulatedRawText() {
    return accumulatedRawText;
}

/**
 * Parse the entire accumulated content with markdown
 * Uses caching for performance optimization
 * @returns {string} Fully parsed HTML
 */
export function parseFinalHtml() {
    // Quick return for empty content
    if (!accumulatedRawText) return '';
    
    // Check cache first to avoid re-parsing identical content
    if (parseCache.has(accumulatedRawText)) {
        return parseCache.get(accumulatedRawText);
    }
    
    let result;
    try {
        if (checkMarkedAvailability()) {
            // Use marked with optimized settings
            result = marked.parse(accumulatedRawText, {
                breaks: true,
                gfm: true,
                async: false,
                silent: true // Don't throw on parse errors
            });
        } else {
            // Fallback if marked isn't available
            result = escapeHTML(accumulatedRawText);
        }
    } catch (error) {
        console.error("Error during markdown parsing:", error);
        result = escapeHTML(accumulatedRawText);
    }
    
    // Cache the result for future use
    if (parseCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry if cache is full
        const firstKey = parseCache.keys().next().value;
        parseCache.delete(firstKey);
    }
    parseCache.set(accumulatedRawText, result);
    
    return result;
}

/**
 * Parse arbitrary markdown text without affecting accumulation
 * @param {string} markdownText - Text to parse
 * @returns {string} Parsed HTML
 */
export function parseMarkdownString(markdownText) {
    if (!markdownText || typeof markdownText !== 'string') {
        return '';
    }
    
    // Check cache for this specific text
    if (parseCache.has(markdownText)) {
        return parseCache.get(markdownText);
    }
    
    let result;
    try {
        if (checkMarkedAvailability()) {
            result = marked.parse(markdownText, {
                breaks: true,
                gfm: true,
                async: false,
                silent: true
            });
        } else {
            result = escapeHTML(markdownText);
        }
    } catch (error) {
        console.error("Error parsing markdown string:", error);
        result = escapeHTML(markdownText);
    }
    
    // Only cache longer content to avoid cache bloat with small strings
    if (markdownText.length > 100 && parseCache.size < MAX_CACHE_SIZE) {
        parseCache.set(markdownText, result);
    }
    
    return result;
}