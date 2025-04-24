// Authentication modal component
import { signIn, signUp, resetPassword } from '../authService.js';
import { showNotification } from '../notificationHelper.js';

let authModal;
let authForm;
let emailInput;
let passwordInput;
let submitButton;
let switchModeButton;
let forgotPasswordButton;
let currentMode = 'signin'; // 'signin', 'signup', or 'reset'

/**
 * Initialize the authentication modal
 */
export function initializeAuthModal() {
    // Create modal if it doesn't exist
    if (!document.getElementById('authModal')) {
        createAuthModal();
    }
    
    // Get references to elements
    authModal = document.getElementById('authModal');
    authForm = document.getElementById('authForm');
    emailInput = document.getElementById('authEmail');
    passwordInput = document.getElementById('authPassword');
    submitButton = document.getElementById('authSubmit');
    switchModeButton = document.getElementById('authSwitchMode');
    forgotPasswordButton = document.getElementById('authForgotPassword');
    
    // Set up event listeners
    authForm.addEventListener('submit', handleSubmit);
    switchModeButton.addEventListener('click', toggleAuthMode);
    forgotPasswordButton.addEventListener('click', showResetMode);
    document.getElementById('authCloseBtn').addEventListener('click', hideAuthModal);
    
    // Initial UI setup
    updateAuthUI();
}

/**
 * Create the authentication modal HTML
 */
function createAuthModal() {
    const modalHTML = `
        <div id="authModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="authTitle">Sign In</h2>
                    <button id="authCloseBtn" class="modal-close">&times;</button>
                </div>
                
                <form id="authForm">
                    <div class="form-group">
                        <label for="authEmail">Email</label>
                        <input type="email" id="authEmail" class="form-input" required>
                    </div>
                    
                    <div class="form-group" id="passwordGroup">
                        <label for="authPassword">Password</label>
                        <input type="password" id="authPassword" class="form-input" required>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" id="authForgotPassword" class="text-button">Forgot password?</button>
                        <div class="auth-buttons">
                            <button type="button" id="authSwitchMode" class="secondary-button">Create account</button>
                            <button type="submit" id="authSubmit" class="primary-button">Sign In</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Update the UI based on the current mode
 */
function updateAuthUI() {
    const authTitle = document.getElementById('authTitle');
    const passwordGroup = document.getElementById('passwordGroup');
    
    switch (currentMode) {
        case 'signin':
            authTitle.textContent = 'Sign In';
            submitButton.textContent = 'Sign In';
            switchModeButton.textContent = 'Create account';
            passwordGroup.style.display = 'block';
            forgotPasswordButton.style.display = 'block';
            break;
        case 'signup':
            authTitle.textContent = 'Create Account';
            submitButton.textContent = 'Sign Up';
            switchModeButton.textContent = 'Sign in instead';
            passwordGroup.style.display = 'block';
            forgotPasswordButton.style.display = 'none';
            break;
        case 'reset':
            authTitle.textContent = 'Reset Password';
            submitButton.textContent = 'Send Reset Email';
            switchModeButton.textContent = 'Back to sign in';
            passwordGroup.style.display = 'none';
            forgotPasswordButton.style.display = 'none';
            break;
    }
}

/**
 * Toggle between sign in and sign up modes
 */
function toggleAuthMode() {
    if (currentMode === 'signin') {
        currentMode = 'signup';
    } else {
        currentMode = 'signin';
    }
    updateAuthUI();
}

/**
 * Show the password reset mode
 */
function showResetMode() {
    currentMode = 'reset';
    updateAuthUI();
}

/**
 * Handle form submission
 * @param {Event} e - Form submit event
 */
async function handleSubmit(e) {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
    
    try {
        switch (currentMode) {
            case 'signin':
                await signIn(email, password);
                hideAuthModal();
                showNotification('Signed in successfully!', 'success');
                break;
            case 'signup':
                await signUp(email, password);
                hideAuthModal();
                showNotification('Account created! Check your email for verification.', 'success');
                break;
            case 'reset':
                await resetPassword(email);
                hideAuthModal();
                break;
        }
    } catch (error) {
        console.error('Auth error:', error);
    } finally {
        submitButton.disabled = false;
        updateAuthUI();
    }
}

/**
 * Show the authentication modal
 */
export function showAuthModal() {
    authModal.style.display = 'flex';
    emailInput.focus();
}

/**
 * Hide the authentication modal
 */
export function hideAuthModal() {
    authModal.style.display = 'none';
    authForm.reset();
}

/**
 * Add styles for the authentication modal
 */
function addAuthStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .auth-buttons {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        
        .text-button {
            background: none;
            border: none;
            color: var(--accent-color);
            cursor: pointer;
            padding: 0;
            font-size: 14px;
            text-decoration: underline;
        }
        
        .text-button:hover {
            color: var(--accent-color-hover);
        }
    `;
    document.head.appendChild(styleElement);
}

// Add styles when this module is imported
addAuthStyles();
