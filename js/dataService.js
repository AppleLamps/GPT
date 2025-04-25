// Data service for Supabase
import { supabase } from './supabaseClient.js';
import { getCurrentUserState } from './state.js';
import { showNotification } from './notificationHelper.js';

/**
 * Save an API key to Supabase
 * @param {string} provider - The API provider (openai, gemini, xai)
 * @param {string} apiKey - The API key
 * @returns {Promise<object>} - The saved API key data
 */
export async function saveApiKey(provider, apiKey) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        // In a production app, you'd encrypt this before sending to Supabase
        // For now, we'll just store it (not recommended for production)
        const { data, error } = await supabase
            .from('api_keys')
            .upsert({
                user_id: user.id,
                provider,
                encrypted_key: apiKey
            }, {
                onConflict: 'user_id, provider'
            });

        if (error) throw error;
        return data;
    } catch (error) {
        showNotification(`Error saving API key: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get all API keys for the current user
 * @returns {Promise<Array<{provider: string, encrypted_key: string}>>} - Array of API keys
 */
export async function getApiKeys() {
    try {
        console.log("getApiKeys: Starting API key retrieval");
        const user = getCurrentUserState();

        if (!user) {
            console.error("getApiKeys: No authenticated user found");
            throw new Error('User not authenticated');
        }

        console.log(`getApiKeys: Fetching API keys for user ID: ${user.id}`);

        // First try a direct query to check if the table exists and is accessible
        try {
            const { count, error: countError } = await supabase
                .from('api_keys')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            if (countError) {
                console.error("getApiKeys: Error checking API keys count:", countError);
            } else {
                console.log(`getApiKeys: Found ${count} API keys for user`);
            }
        } catch (countError) {
            console.error("getApiKeys: Exception during count check:", countError);
        }

        // Now perform the actual query
        console.log("getApiKeys: Executing main query");
        const { data, error } = await supabase
            .from('api_keys')
            .select('provider, encrypted_key')
            .eq('user_id', user.id);

        if (error) {
            console.error("getApiKeys: Query error:", error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn("getApiKeys: No API keys found for user");
            return [];
        }

        console.log(`getApiKeys: Successfully retrieved ${data.length} API keys`);
        // Log providers without exposing the actual keys
        const providers = data.map(key => key.provider);
        console.log("getApiKeys: Found keys for providers:", providers);

        return data;
    } catch (error) {
        console.error('Error getting API keys:', error);
        console.error('Error details:', error.stack || "No stack trace available");
        return [];
    }
}

/**
 * Save user settings to Supabase
 * @param {object} settings - User settings
 * @returns {Promise<object>} - The saved settings data
 */
export async function saveSettings(settings) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('settings')
            .upsert({
                user_id: user.id,
                default_model: settings.model,
                tts_instructions: settings.ttsInstructions,
                tts_voice: settings.ttsVoice,
                enable_html_sandbox: settings.enableHtmlSandbox
            }, {
                onConflict: 'user_id'
            });

        if (error) throw error;
        return data;
    } catch (error) {
        showNotification(`Error saving settings: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get user settings from Supabase
 * @returns {Promise<object>} - User settings
 */
export async function getSettings() {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows returned"

        return data || {};
    } catch (error) {
        console.error('Error getting settings:', error);
        return {};
    }
}

/**
 * Save a chat to Supabase
 * @param {Array} history - Chat history
 * @param {string|null} existingChatId - ID of existing chat to update, or null for new chat
 * @param {string|null} title - Chat title, or null to generate from first message
 * @returns {Promise<{id: string, title: string, timestamp: number}|null>} - Chat metadata
 */
export async function saveChat(history, existingChatId = null, title = null) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        if (!history || history.length === 0) {
            console.warn("Attempted to save an empty chat history.");
            return null;
        }

        // Determine title
        let chatTitle = title;
        if (!chatTitle) {
            const firstUserMessage = history.find(m => m.role === 'user' && m.content);
            chatTitle = firstUserMessage
                ? firstUserMessage.content.substring(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '')
                : `Chat ${new Date().toLocaleTimeString()}`;
        }

        // Save or update chat metadata
        let chatId = existingChatId;
        let chatData;

        if (!chatId) {
            // Create new chat
            const { data, error } = await supabase
                .from('chats')
                .insert({
                    user_id: user.id,
                    title: chatTitle,
                })
                .select()
                .single();

            if (error) throw error;
            chatData = data;
            chatId = data.id;
        } else {
            // Update existing chat
            const { data, error } = await supabase
                .from('chats')
                .update({
                    title: chatTitle,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chatId)
                .eq('user_id', user.id)
                .select()
                .single();

            if (error) throw error;
            chatData = data;
        }

        // Delete existing messages if updating
        if (existingChatId) {
            const { error: deleteError } = await supabase
                .from('messages')
                .delete()
                .eq('chat_id', chatId);

            if (deleteError) throw deleteError;
        }

        // Save messages
        const messages = history.map(msg => ({
            chat_id: chatId,
            role: msg.role,
            content: msg.content,
            metadata: {
                imageData: msg.imageData || null,
                generatedImageUrl: msg.generatedImageUrl || null,
                attachedFilesMeta: msg.attachedFilesMeta || null
            }
        }));

        const { error: messagesError } = await supabase
            .from('messages')
            .insert(messages);

        if (messagesError) throw messagesError;

        return {
            id: chatId,
            title: chatTitle,
            timestamp: new Date().getTime()
        };
    } catch (error) {
        showNotification(`Error saving chat: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get list of chats for the current user
 * @returns {Promise<Array<{id: string, title: string, timestamp: number}>>} - Array of chat metadata
 */
export async function getChatList() {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('chats')
            .select('id, title, updated_at')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return data.map(chat => ({
            id: chat.id,
            title: chat.title,
            timestamp: new Date(chat.updated_at).getTime()
        }));
    } catch (error) {
        console.error('Error getting chat list:', error);
        return [];
    }
}

/**
 * Load a chat from Supabase
 * @param {string} chatId - Chat ID
 * @returns {Promise<Array|null>} - Chat history or null if not found
 */
export async function loadChat(chatId) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('messages')
            .select('role, content, metadata')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return data.map(msg => ({
            role: msg.role,
            content: msg.content,
            imageData: msg.metadata?.imageData || null,
            generatedImageUrl: msg.metadata?.generatedImageUrl || null,
            attachedFilesMeta: msg.metadata?.attachedFilesMeta || null
        }));
    } catch (error) {
        console.error(`Error loading chat ${chatId}:`, error);
        return null;
    }
}

/**
 * Delete a chat from Supabase
 * @param {string} chatId - Chat ID
 * @returns {Promise<boolean>} - True if successful
 */
export async function deleteChat(chatId) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        // Delete messages first (cascade would be better in the DB schema)
        const { error: messagesError } = await supabase
            .from('messages')
            .delete()
            .eq('chat_id', chatId);

        if (messagesError) throw messagesError;

        // Then delete the chat
        const { error } = await supabase
            .from('chats')
            .delete()
            .eq('id', chatId)
            .eq('user_id', user.id);

        if (error) throw error;

        return true;
    } catch (error) {
        showNotification(`Error deleting chat: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Save a custom GPT configuration to Supabase
 * @param {object} config - Custom GPT configuration
 * @returns {Promise<{id: string, name: string, description: string}|null>} - Config metadata
 */
export async function saveCustomGpt(config) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        if (!config || !config.name || !config.name.trim()) {
            showNotification("Configuration must have a name.", "error");
            return null;
        }

        const configId = config.id || crypto.randomUUID();

        // Save the main config
        const { data, error } = await supabase
            .from('custom_gpts')
            .upsert({
                id: configId,
                user_id: user.id,
                name: config.name.trim(),
                description: config.description || '',
                instructions: config.instructions || '',
                capabilities: config.capabilities || {}
            }, {
                onConflict: 'id'
            })
            .select()
            .single();

        if (error) throw error;

        // Handle knowledge files
        if (config.knowledgeFiles && config.knowledgeFiles.length > 0) {
            // Delete existing knowledge files if updating
            const { error: deleteError } = await supabase
                .from('knowledge_files')
                .delete()
                .eq('custom_gpt_id', configId);

            if (deleteError) throw deleteError;

            // Insert new knowledge files
            const knowledgeFiles = config.knowledgeFiles.map(file => ({
                custom_gpt_id: configId,
                name: file.name,
                type: file.type,
                content: file.content
            }));

            const { error: filesError } = await supabase
                .from('knowledge_files')
                .insert(knowledgeFiles);

            if (filesError) throw filesError;
        }

        return {
            id: configId,
            name: config.name,
            description: config.description || ''
        };
    } catch (error) {
        showNotification(`Error saving custom GPT: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Get list of custom GPT configurations for the current user
 * @returns {Promise<Array<{id: string, name: string, description: string}>>} - Array of config metadata
 */
export async function getCustomGptList() {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('custom_gpts')
            .select('id, name, description')
            .eq('user_id', user.id)
            .order('name');

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting custom GPT list:', error);
        return [];
    }
}

/**
 * Load a custom GPT configuration from Supabase
 * @param {string} configId - Config ID
 * @returns {Promise<object|null>} - Full config object or null if not found
 */
export async function loadCustomGpt(configId) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        // Get the main config
        const { data: config, error } = await supabase
            .from('custom_gpts')
            .select('*')
            .eq('id', configId)
            .eq('user_id', user.id)
            .single();

        if (error) throw error;

        // Get knowledge files
        const { data: files, error: filesError } = await supabase
            .from('knowledge_files')
            .select('name, type, content')
            .eq('custom_gpt_id', configId);

        if (filesError) throw filesError;

        return {
            ...config,
            knowledgeFiles: files || []
        };
    } catch (error) {
        console.error(`Error loading custom GPT ${configId}:`, error);
        return null;
    }
}

/**
 * Delete a custom GPT configuration from Supabase
 * @param {string} configId - Config ID
 * @returns {Promise<boolean>} - True if successful
 */
export async function deleteCustomGpt(configId) {
    try {
        const user = getCurrentUserState();
        if (!user) throw new Error('User not authenticated');

        // Delete knowledge files first (cascade would be better in the DB schema)
        const { error: filesError } = await supabase
            .from('knowledge_files')
            .delete()
            .eq('custom_gpt_id', configId);

        if (filesError) throw filesError;

        // Then delete the config
        const { error } = await supabase
            .from('custom_gpts')
            .delete()
            .eq('id', configId)
            .eq('user_id', user.id);

        if (error) throw error;

        return true;
    } catch (error) {
        showNotification(`Error deleting custom GPT: ${error.message}`, 'error');
        return false;
    }
}
