// User ID check utility
import { supabase } from './supabaseClient.js';
import { getCurrentUserState } from './state.js';

/**
 * Check if the user ID in the database matches the authenticated user ID
 * @returns {Promise<object>} - Check results
 */
export async function checkUserIdMatch() {
    const results = {
        authenticated: false,
        authUserId: null,
        apiKeysFound: false,
        apiKeysUserId: null,
        match: false,
        error: null
    };
    
    try {
        // Get authenticated user
        const user = getCurrentUserState();
        if (!user) {
            results.error = 'No authenticated user found';
            return results;
        }
        
        results.authenticated = true;
        results.authUserId = user.id;
        
        // Check API keys table
        const { data, error } = await supabase
            .from('api_keys')
            .select('user_id')
            .limit(1);
            
        if (error) {
            results.error = `Error querying API keys: ${error.message}`;
            return results;
        }
        
        if (data && data.length > 0) {
            results.apiKeysFound = true;
            results.apiKeysUserId = data[0].user_id;
            results.match = data[0].user_id === user.id;
        }
        
        return results;
    } catch (error) {
        results.error = `Unexpected error: ${error.message}`;
        return results;
    }
}

/**
 * Check if the user has access to the API keys table
 * @returns {Promise<object>} - Access check results
 */
export async function checkApiKeysAccess() {
    const results = {
        authenticated: false,
        userId: null,
        canSelect: false,
        canInsert: false,
        canUpdate: false,
        canDelete: false,
        error: null
    };
    
    try {
        // Get authenticated user
        const user = getCurrentUserState();
        if (!user) {
            results.error = 'No authenticated user found';
            return results;
        }
        
        results.authenticated = true;
        results.userId = user.id;
        
        // Check SELECT access
        try {
            const { data, error } = await supabase
                .from('api_keys')
                .select('id')
                .eq('user_id', user.id)
                .limit(1);
                
            results.canSelect = !error;
        } catch (error) {
            console.error('Error checking SELECT access:', error);
        }
        
        // Check INSERT access
        try {
            const testKey = {
                user_id: user.id,
                provider: 'test',
                encrypted_key: 'test-key-' + Date.now()
            };
            
            const { data, error } = await supabase
                .from('api_keys')
                .insert(testKey)
                .select();
                
            results.canInsert = !error;
            
            // Clean up test key
            if (!error && data && data.length > 0) {
                await supabase
                    .from('api_keys')
                    .delete()
                    .eq('id', data[0].id);
            }
        } catch (error) {
            console.error('Error checking INSERT access:', error);
        }
        
        return results;
    } catch (error) {
        results.error = `Unexpected error: ${error.message}`;
        return results;
    }
}
