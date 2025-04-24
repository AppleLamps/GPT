// Authentication service for Supabase
import { supabase } from './supabaseClient.js';
import { showNotification } from './notificationHelper.js';
import { setCurrentUserState } from './state.js';

/**
 * Sign up a new user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<object>} - User data
 */
export async function signUp(email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        
        if (error) throw error;
        
        showNotification('Account created! Check your email for verification.', 'success');
        return data;
    } catch (error) {
        showNotification(`Error signing up: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Sign in an existing user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<object>} - Session data
 */
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        
        if (error) throw error;
        
        // Update application state with the user
        setCurrentUserState(data.user);
        
        showNotification('Signed in successfully!', 'success');
        return data;
    } catch (error) {
        showNotification(`Error signing in: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Sign out the current user
 */
export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        // Clear user from application state
        setCurrentUserState(null);
        
        showNotification('Signed out successfully', 'success');
    } catch (error) {
        showNotification(`Error signing out: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Send a password reset email
 * @param {string} email - User's email
 */
export async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        
        if (error) throw error;
        
        showNotification('Password reset email sent', 'success');
    } catch (error) {
        showNotification(`Error sending reset email: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get the current user
 * @returns {Promise<object|null>} - User object or null if not logged in
 */
export async function getCurrentUser() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

/**
 * Set up auth state change listener
 * @param {Function} callback - Function to call when auth state changes
 * @returns {Function} - Unsubscribe function
 */
export function onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            setCurrentUserState(session?.user || null);
        } else if (event === 'SIGNED_OUT') {
            setCurrentUserState(null);
        }
        
        if (callback) {
            callback(event, session);
        }
    });
}

/**
 * Initialize auth state on app load
 */
export async function initializeAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        setCurrentUserState(session?.user || null);
        
        // Set up auth state change listener
        onAuthStateChange();
        
        console.log('Auth initialized:', session?.user ? 'User logged in' : 'No user');
    } catch (error) {
        console.error('Error initializing auth:', error);
    }
}
