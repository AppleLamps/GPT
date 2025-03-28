// ===== FILE: js/components/welcomeScreen.js =====

// Import functions from other components/modules as needed
import { setMessageInputValue } from './chatInput.js';
// Assuming showWelcomeInterface is exported from messageList or a central ui module
// If not, the logic to show/hide might need to be duplicated or refactored.
// For now, assume it's handled elsewhere and this component just manages its internal interactions.

// --- DOM Elements ---
const welcomeScreenElement = document.getElementById('welcomeScreen');
const examplePromptsContainer = welcomeScreenElement?.querySelector('.example-prompts');

// --- Welcome Screen Logic ---

/**
 * Handles clicks on the example prompt elements.
 * @param {Event} event - The click event.
 */
function handleExamplePromptClick(event) {
    // Ensure the click is directly on an element with the 'example-prompt' class
    if (event.target.classList.contains('example-prompt')) {
        const promptText = event.target.textContent;
        if (promptText) {
            // Use the imported function to set the input value
            setMessageInputValue(promptText);
            // Optionally, you could also automatically send the message here
            // import { handleSendMessage } from './chatInput.js'; // If exported
            // handleSendMessage();
        }
    }
}

// --- Initialization ---

/**
 * Attaches event listeners specific to the welcome screen.
 */
export function initializeWelcomeScreen() {
    // Use event delegation on the container for example prompts
    if (examplePromptsContainer) {
        examplePromptsContainer.addEventListener('click', handleExamplePromptClick);
    }
}

// --- Exports ---
// Export functions if needed by other modules (e.g., maybe a function to explicitly show it)
// Generally, showing/hiding might be controlled by messageList or main.js