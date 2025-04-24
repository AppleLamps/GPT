// Supabase-backed chat store replacing localStorage calls.
import * as dataService from './dataService.js';

/**
 * Save a chat session's history via Supabase.
 * @param {Array<{role: string, content: string}>} history - The chat history.
 * @param {string|null} existingChatId - ID of chat to update, or null to create new.
 * @param {string|null} title - Optional title for the chat.
 * @returns {Promise<{id: string, title: string, timestamp: number}|null>}
 */
export async function saveChat(history, existingChatId = null, title = null) {
    try {
        return await dataService.saveChat(history, existingChatId, title);
    } catch (error) {
        console.error('Error in chatStore.saveChat:', error);
        return null;
    }
}

/**
 * Get list of chats for the current user.
 * @returns {Promise<Array<{id: string, title: string, timestamp: number}>>}
 */
export async function getChatList() {
    try {
        return await dataService.getChatList();
    } catch (error) {
        console.error('Error in chatStore.getChatList:', error);
        return [];
    }
}

/**
 * Load a chat's history by ID.
 * @param {string} chatId - Chat ID.
 * @returns {Promise<Array<{role: string, content: string, imageData: any, attachedFilesMeta: any}>|null>}
 */
export async function loadChat(chatId) {
    try {
        return await dataService.loadChat(chatId);
    } catch (error) {
        console.error('Error in chatStore.loadChat:', error);
        return null;
    }
}

/**
 * Delete a chat by ID.
 * @param {string} chatId - Chat ID.
 * @returns {Promise<boolean>}
 */
export async function deleteChat(chatId) {
    try {
        return await dataService.deleteChat(chatId);
    } catch (error) {
        console.error('Error in chatStore.deleteChat:', error);
        return false;
    }
}

/**
 * Delete all chats for the current user.
 * @returns {Promise<boolean>}
 */
export async function deleteAllChats() {
    try {
        const chats = await dataService.getChatList();
        for (const chat of chats) {
            await dataService.deleteChat(chat.id);
        }
        return true;
    } catch (error) {
        console.error('Error in chatStore.deleteAllChats:', error);
        return false;
    }
}
