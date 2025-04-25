// Debug helper functions for API key issues
import { supabase } from './supabaseClient.js';
import { getCurrentUserState } from './state.js';
import * as dataService from './dataService.js';

/**
 * Run a comprehensive debug check for API key issues
 * @returns {Promise<object>} Debug results
 */
export async function debugApiKeyIssues() {
    const results = {
        authState: null,
        apiKeysFromService: null,
        apiKeysFromDirect: null,
        errors: []
    };
    
    try {
        // 1. Check authentication state
        const user = getCurrentUserState();
        results.authState = user ? {
            id: user.id,
            email: user.email,
            authenticated: true
        } : { authenticated: false };
        
        if (!user) {
            results.errors.push('User not authenticated');
            return results;
        }
        
        // 2. Try to get API keys using dataService
        try {
            const apiKeys = await dataService.getApiKeys();
            results.apiKeysFromService = apiKeys;
        } catch (error) {
            results.errors.push(`dataService.getApiKeys error: ${error.message}`);
        }
        
        // 3. Try direct query to the database
        try {
            const { data, error } = await supabase
                .from('api_keys')
                .select('provider, encrypted_key')
                .eq('user_id', user.id);
                
            if (error) throw error;
            results.apiKeysFromDirect = data;
        } catch (error) {
            results.errors.push(`Direct query error: ${error.message}`);
        }
        
        // 4. Check if user ID matches
        if (results.apiKeysFromDirect && results.apiKeysFromDirect.length > 0) {
            // We have API keys, but they're not being loaded correctly
            results.errors.push('API keys exist in database but are not being loaded correctly');
        }
        
    } catch (error) {
        results.errors.push(`Unexpected error: ${error.message}`);
    }
    
    return results;
}

/**
 * Log the current state of the application
 */
export function logAppState() {
    const user = getCurrentUserState();
    
    console.group('Application State');
    console.log('User:', user ? `${user.email} (${user.id})` : 'Not authenticated');
    console.log('User object:', user);
    console.groupEnd();
    
    return {
        user: user ? {
            id: user.id,
            email: user.email,
            authenticated: true
        } : { authenticated: false }
    };
}

/**
 * Fix common API key issues
 */
export async function attemptApiKeyFix() {
    const user = getCurrentUserState();
    if (!user) {
        console.error('Cannot fix API keys: User not authenticated');
        return { success: false, message: 'User not authenticated' };
    }
    
    try {
        // 1. Force reload settings
        await import('./state.js').then(state => state.loadSettings());
        
        // 2. Check if API keys are now loaded
        const debugResults = await debugApiKeyIssues();
        
        if (debugResults.apiKeysFromService && debugResults.apiKeysFromService.length > 0) {
            return { 
                success: true, 
                message: 'API keys successfully loaded after fix',
                keys: debugResults.apiKeysFromService
            };
        } else {
            return { 
                success: false, 
                message: 'API keys still not loading after fix attempt',
                debugResults
            };
        }
    } catch (error) {
        return { 
            success: false, 
            message: `Error during fix attempt: ${error.message}`
        };
    }
}
