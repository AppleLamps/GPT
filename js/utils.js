// ===== FILE: js/utils.js =====
import * as state from './state.js';
import { showNotification } from './components/notification.js';
// Dynamic import for renderFilePreviews removed from here, handled in chatInput.js if needed

// --- PDF.js CDN Loading (Deferred) ---
const PDFJS_VERSION = '4.0.379'; // Specify the desired PDF.js version
let pdfjsLib = null;
let pdfjsLoadPromise = null;

async function loadAndConfigurePdfJs() {
    if (pdfjsLib) return pdfjsLib;
    if (pdfjsLib === false) throw new Error("PDF library failed to load previously.");
    if (pdfjsLoadPromise) return await pdfjsLoadPromise;

    pdfjsLoadPromise = (async () => {
        try {
            console.log(`Attempting to load PDF.js library (v${PDFJS_VERSION}) from CDN...`);
            const lib = await import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.mjs`);
            if (!lib || !lib.getDocument) throw new Error("Imported PDF.js library object is invalid.");

            if (!lib.GlobalWorkerOptions.workerSrc) {
                lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;
                console.log(`PDF.js v${PDFJS_VERSION} worker source configured.`);
            } else {
                console.log(`PDF.js v${PDFJS_VERSION} worker source already configured.`);
            }

            pdfjsLib = lib;
            console.log("PDF.js library loaded successfully.");
            return pdfjsLib;
        } catch (importError) {
            console.error(`Error loading/configuring PDF.js (v${PDFJS_VERSION}):`, importError);
            showNotification(`Error loading PDF library. PDF features disabled.`, 'error', 10000);
            pdfjsLib = false;
            throw importError;
        } finally {
            pdfjsLoadPromise = null;
        }
    })();
    return await pdfjsLoadPromise;
}
// --- End PDF.js Loading ---

/**
 * <<< ADDED export >>>
 * Reads text content from TXT or MD files.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readTextFile(file) { // <<< ADDED export
    console.log(`Reading text file: ${file.name}`);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => {
            console.error(`Error reading text file ${file.name}:`, error);
            reject(error);
        };
        reader.readAsText(file);
    });
}

/**
 * <<< ADDED export >>>
 * Extracts text content from a PDF file using pdf.js.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function readPdfFile(file) { // <<< ADDED export
    console.log(`Attempting to read PDF file: ${file.name}`);
    let currentPdfjsLib;
    try {
        currentPdfjsLib = await loadAndConfigurePdfJs();
    } catch (error) {
        console.error(`PDF library loading failed for ${file.name}.`);
        throw new Error("PDF processing library is not available.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = currentPdfjsLib.getDocument({ data: arrayBuffer });

    try {
        const pdf = await loadingTask.promise;
        console.log(`PDF loaded: ${file.name}, Pages: ${pdf.numPages}`);
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item?.str || '').join(' ');
                fullText += pageText + '\n\n';
            } catch (pageError) {
                console.error(`Error processing page ${i} of ${file.name}:`, pageError);
                fullText += `[Error processing page ${i}]\n\n`;
            }
        }
        console.log(`Finished extracting text from ${file.name}`);
        return fullText.trim();
    } catch (pdfError) {
        console.error(`Error loading/parsing PDF ${file.name}:`, pdfError);
        if (pdfError.name === 'PasswordException') {
            throw new Error(`Could not open PDF "${file.name}": Password protected.`);
        }
        throw new Error(`Error processing PDF "${file.name}": ${pdfError.message}`);
    }
}

/**
 * Processes a single file for per-message attachment: reads content and updates state.
 * @param {File} file The file object to process.
 */
export async function processAndStoreFile(file) {
    // This function is for per-message files, managed via chatInput.js and state.js (attachedFiles)
    let renderFilePreviews;
    const fileName = file.name;
    const fileType = file.type;
    console.log(`processAndStoreFile (per-message): Starting for ${fileName}, Type: ${fileType}`);

    try {
        // Dynamically import renderFilePreviews from chatInput.js when needed
        const chatInputModule = await import('./components/chatInput.js');
        renderFilePreviews = chatInputModule.renderFilePreviews;

        let content = '';
        if (fileType === 'application/pdf') {
            content = await readPdfFile(file);
        } else if (fileType === 'text/plain' || fileType === 'text/markdown' || fileName.endsWith('.md')) {
            content = await readTextFile(file);
        } else {
            throw new Error(`Unsupported file type: ${fileType || 'Unknown'}`);
        }

        const contentWithHeader = `--- START OF FILE: ${fileName} ---\n\n${content}\n\n--- END OF FILE: ${fileName} ---`;
        state.updateAttachedFileContent(fileName, contentWithHeader); // Updates per-message state
        console.log(`Successfully processed per-message file: ${fileName}`);

    } catch (error) {
        console.error(`Error processing per-message file ${fileName}:`, error);
        state.setAttachedFileError(fileName, error.message || "Failed to process file.");
        showNotification(`Error processing ${fileName}: ${error.message}`, 'error', 5000);
    } finally {
        // Always update the UI for per-message files
        if (renderFilePreviews && typeof renderFilePreviews === 'function') {
            try { renderFilePreviews(); } catch (renderError) { console.error("Error executing renderFilePreviews:", renderError); }
        } else { console.error("renderFilePreviews function not available in finally block."); }
    }
}

// --- General Utility Functions ---

/**
 * <<< ADDED and Exported >>>
 * Generates a unique ID string.
 * @param {string} [prefix='id'] - Optional prefix for the ID.
 * @returns {string} A unique identifier.
 */
export function generateId(prefix = 'id') { // <<< ADDED
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export function escapeHTML(text) {
    if (typeof text !== 'string') return text;
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export async function copyTextToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            console.log("Text copied using Clipboard API.");
            return;
        } catch (err) { console.error('Failed to copy text using Clipboard API: ', err); }
    }
    // Fallback
    console.warn('Using fallback method for copying text (document.execCommand).');
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed'; textArea.style.top = '-9999px'; textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus(); textArea.select();
    try {
        document.execCommand('copy');
    } catch (err) { console.error('Error during fallback copy: ', err); }
    finally { document.body.removeChild(textArea); }
}

export function convertToBase64(file) {
    console.log(`Converting file to Base64: ${file?.name}`);
    return new Promise((resolve, reject) => {
        if (!file || !(file instanceof File)) return reject(new Error("Input must be a File object."));
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') { resolve(reader.result); }
            else { reject(new Error("FileReader did not return a string result.")); }
        };
        reader.onerror = (error) => { console.error(`FileReader error during Base64 conversion for ${file.name}:`, error); reject(error); };
        reader.readAsDataURL(file);
    });
}