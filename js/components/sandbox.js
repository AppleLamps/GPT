// ===== FILE: js/components/sandbox.js =====
import { copyTextToClipboard } from '../utils.js';

/**
 * Creates a sandbox container with an HTML preview iframe and controls.
 * @param {HTMLElement} originalPreElement - The original pre element containing the code
 * @param {string} [language='HTML'] - The language/type of code being rendered
 * @returns {HTMLElement} The sandbox container element
 */
export function createSandbox(originalPreElement, language = 'HTML') {
    // Extract the raw code from the original element
    const rawCode = originalPreElement.querySelector('code')?.textContent || '';

    // Create the main container
    const sandboxContainer = document.createElement('div');
    sandboxContainer.className = 'sandbox-container';

    // Create the header
    const sandboxHeader = document.createElement('div');
    sandboxHeader.className = 'sandbox-header';

    // Add language label
    const languageLabel = document.createElement('span');
    languageLabel.textContent = `${language} Preview`;
    sandboxHeader.appendChild(languageLabel);

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'sandbox-header-buttons';

    // Add toggle button
    const toggleButton = document.createElement('button');
    toggleButton.className = 'sandbox-toggle-button';
    toggleButton.textContent = 'Preview';
    toggleButton.dataset.view = 'code';

    // Add copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'sandbox-copy-button';
    copyButton.textContent = 'Copy Code';
    copyButton.addEventListener('click', async () => {
        await copyTextToClipboard(rawCode);
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.disabled = true;
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.disabled = false;
        }, 2000);
    });

    // Add buttons to button container
    buttonContainer.appendChild(toggleButton);
    buttonContainer.appendChild(copyButton);

    // Add button container to header
    sandboxHeader.appendChild(buttonContainer);

    // Clone the original code view
    const codeViewElement = originalPreElement.cloneNode(true);
    codeViewElement.classList.add('sandbox-code-view');
    // Optional cleanup of language class
    codeViewElement.querySelector('code')?.classList.remove(`language-${language.toLowerCase()}`);

    // Create the iframe (initially hidden)
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';
    iframe.classList.add('sandbox-iframe-view');
    iframe.style.display = 'none';
    
    // Define the iframe content with basic HTML structure
    const iframeContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sandbox</title>
            <style>
                body { 
                    margin: 5px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                }
            </style>
        </head>
        <body>
            ${rawCode}
        </body>
        </html>
    `;
    
    iframe.srcdoc = iframeContent;

    // Implement toggle logic
    toggleButton.addEventListener('click', () => {
        const currentView = toggleButton.dataset.view;
        if (currentView === 'code') {
            // Switch to Preview
            codeViewElement.style.display = 'none';
            iframe.style.display = 'block';
            toggleButton.textContent = 'Code';
            toggleButton.dataset.view = 'preview';
        } else {
            // Switch to Code
            iframe.style.display = 'none';
            codeViewElement.style.display = 'block';
            toggleButton.textContent = 'Preview';
            toggleButton.dataset.view = 'code';
        }
    });

    // Assemble the sandbox
    sandboxContainer.appendChild(sandboxHeader);
    sandboxContainer.appendChild(codeViewElement);
    sandboxContainer.appendChild(iframe);

    return sandboxContainer;
}
