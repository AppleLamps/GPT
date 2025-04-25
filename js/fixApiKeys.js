// API Key Fix Utility
import { supabase } from './supabaseClient.js';
import { getCurrentUserState } from './state.js';
import { showNotification } from './notificationHelper.js';

/**
 * Fix API keys by updating the user_id to match the current authenticated user
 * @param {string} oldUserId - The old user ID to update
 * @returns {Promise<object>} - Results of the fix operation
 */
export async function fixApiKeyUserId(oldUserId) {
    const results = {
        success: false,
        keysUpdated: 0,
        message: '',
        error: null
    };
    
    try {
        // Get authenticated user
        const user = getCurrentUserState();
        if (!user) {
            results.message = 'No authenticated user found';
            return results;
        }
        
        console.log(`Attempting to fix API keys: Update user_id from ${oldUserId} to ${user.id}`);
        
        // Update API keys
        const { data, error, count } = await supabase
            .from('api_keys')
            .update({ user_id: user.id })
            .eq('user_id', oldUserId)
            .select();
            
        if (error) {
            results.error = error.message;
            results.message = `Error updating API keys: ${error.message}`;
            return results;
        }
        
        results.success = true;
        results.keysUpdated = data ? data.length : 0;
        results.message = `Successfully updated ${results.keysUpdated} API keys`;
        
        return results;
    } catch (error) {
        results.error = error.message;
        results.message = `Unexpected error: ${error.message}`;
        return results;
    }
}

/**
 * Create API keys for the current user based on the provided keys
 * @param {Array<{provider: string, encrypted_key: string}>} keys - API keys to create
 * @returns {Promise<object>} - Results of the operation
 */
export async function createApiKeys(keys) {
    const results = {
        success: false,
        keysCreated: 0,
        message: '',
        error: null
    };
    
    try {
        // Get authenticated user
        const user = getCurrentUserState();
        if (!user) {
            results.message = 'No authenticated user found';
            return results;
        }
        
        if (!keys || keys.length === 0) {
            results.message = 'No keys provided to create';
            return results;
        }
        
        console.log(`Attempting to create ${keys.length} API keys for user ${user.id}`);
        
        // Prepare keys with the current user ID
        const keysToCreate = keys.map(key => ({
            user_id: user.id,
            provider: key.provider,
            encrypted_key: key.encrypted_key
        }));
        
        // Insert keys
        const { data, error } = await supabase
            .from('api_keys')
            .upsert(keysToCreate, {
                onConflict: 'user_id, provider'
            })
            .select();
            
        if (error) {
            results.error = error.message;
            results.message = `Error creating API keys: ${error.message}`;
            return results;
        }
        
        results.success = true;
        results.keysCreated = data ? data.length : 0;
        results.message = `Successfully created ${results.keysCreated} API keys`;
        
        return results;
    } catch (error) {
        results.error = error.message;
        results.message = `Unexpected error: ${error.message}`;
        return results;
    }
}
