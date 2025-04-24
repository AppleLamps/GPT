// ===== FILE: js/components/dialog.js =====

// Create a custom confirmation dialog that matches our app's styling
export function showConfirmDialog(message, onConfirm, onCancel) {
    const overlay = document.getElementById('overlay');
    
    // Create the dialog element
    const dialogElement = document.createElement('div');
    dialogElement.className = 'custom-dialog';
    
    // Set dialog content with message and buttons
    dialogElement.innerHTML = `
        <div class="dialog-content">
            <p>${message}</p>
            <div class="dialog-buttons">
                <button class="dialog-button cancel-button">Cancel</button>
                <button class="dialog-button confirm-button">OK</button>
            </div>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(dialogElement);
    
    // Show overlay
    if (overlay) {
        overlay.classList.add('visible');
    }
    
    // Get button elements
    const confirmButton = dialogElement.querySelector('.confirm-button');
    const cancelButton = dialogElement.querySelector('.cancel-button');
    
    // Set up button event handlers
    confirmButton.addEventListener('click', () => {
        closeDialog();
        if (onConfirm) onConfirm();
    });
    
    cancelButton.addEventListener('click', () => {
        closeDialog();
        if (onCancel) onCancel();
    });
    
    // Close dialog function
    function closeDialog() {
        if (overlay) {
            overlay.classList.remove('visible');
        }
        document.body.removeChild(dialogElement);
    }
} 