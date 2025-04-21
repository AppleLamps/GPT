// ===== FILE: js/chatStore.js =====

// Constants for localStorage keys
const CHAT_LIST_KEY = 'chat_list'; // Key for the array of chat metadata
const CHAT_PREFIX = 'chat_';     // Prefix for individual chat history keys

/**
 * Generates a unique ID for a chat.
 * Simple implementation using timestamp + random string.
 * @returns {string} A unique identifier.
 */
function generateChatId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Retrieves the list of chat metadata from localStorage.
 * @returns {Array<{id: string, title: string, timestamp: number}>} An array of chat metadata objects, sorted by timestamp descending (newest first).
 */
export function getChatList() {
    try {
        const listJson = localStorage.getItem(CHAT_LIST_KEY);
        const list = listJson ? JSON.parse(listJson) : [];
        // Sort by timestamp, newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        return list;
    } catch (error) {
        console.error("Error getting chat list from localStorage:", error);
        return []; // Return empty array on error
    }
}

/**
 * Saves the current chat list metadata array to localStorage.
 * @param {Array<{id: string, title: string, timestamp: number}>} chatList - The array of chat metadata.
 * @returns {boolean} True if saving was successful, false otherwise.
 */
function saveChatList(chatList) {
    try {
        localStorage.setItem(CHAT_LIST_KEY, JSON.stringify(chatList));
        return true;
    } catch (error) {
        console.error("Error saving chat list to localStorage:", error);
        return false;
    }
}

/**
 * Saves a chat session's history to localStorage.
 * Adds metadata to the chat list.
 * @param {Array<{role: string, content: string}>} history - The chat history array.
 * @param {string | null} [existingChatId=null] - If provided, updates the existing chat. Otherwise, creates a new one.
 * @param {string | null} [title=null] - An optional title for the chat. If null, a default title is generated.
 * @returns {{id: string, title: string, timestamp: number} | null} The metadata of the saved/updated chat, or null on failure.
 */
export function saveChat(history, existingChatId = null, title = null) {
    if (!history || history.length === 0) {
        console.warn("Attempted to save an empty chat history.");
        return null; // Don't save empty chats
    }

    try {
        const timestamp = Date.now();
        let chatId = existingChatId;
        let isNewChat = false;

        if (!chatId) {
            // Create new chat
            chatId = generateChatId();
            isNewChat = true;
            console.log("Saving new chat with ID:", chatId);
        } else {
            console.log("Updating existing chat with ID:", chatId);
        }

        // Determine title
        let chatTitle = title;
        if (!chatTitle) {
            // Generate a default title from the first user message or a generic placeholder
            const firstUserMessage = history.find(m => m.role === 'user' && m.content);
            chatTitle = firstUserMessage ? firstUserMessage.content.substring(0, 40) + (firstUserMessage.content.length > 40 ? '...' : '') : `Chat ${new Date(timestamp).toLocaleTimeString()}`;
        }

        // Save the actual chat history content
        const chatKey = `${CHAT_PREFIX}${chatId}`;
        localStorage.setItem(chatKey, JSON.stringify(history));

        // Update the chat list metadata
        const chatList = getChatList();
        const chatMetadata = { id: chatId, title: chatTitle, timestamp };

        if (isNewChat) {
            chatList.push(chatMetadata);
        } else {
            // Update existing entry in the list
            const index = chatList.findIndex(chat => chat.id === chatId);
            if (index !== -1) {
                chatList[index] = chatMetadata; // Update title and timestamp
            } else {
                // If somehow it wasn't in the list, add it (defensive)
                chatList.push(chatMetadata);
            }
        }

        if (saveChatList(chatList)) {
            return chatMetadata; // Return the metadata of the saved chat
        } else {
            // If saving the list failed, try to roll back the individual chat save (optional)
            localStorage.removeItem(chatKey);
            return null;
        }

    } catch (error) {
        console.error("Error saving chat:", error);
        return null;
    }
}

/**
 * Loads a specific chat's history from localStorage.
 * @param {string} chatId - The ID of the chat to load.
 * @returns {Array<{role: string, content: string}> | null} The chat history array, or null if not found or on error.
 */
export function loadChat(chatId) {
    try {
        const chatKey = `${CHAT_PREFIX}${chatId}`;
        const historyJson = localStorage.getItem(chatKey);
        if (!historyJson) {
            console.warn(`Chat history not found for ID: ${chatId}`);
            return null;
        }
        const history = JSON.parse(historyJson);
        return history;
    } catch (error) {
        console.error(`Error loading chat ${chatId}:`, error);
        return null;
    }
}

/**
 * Deletes a chat from localStorage (both history and list metadata).
 * @param {string} chatId - The ID of the chat to delete.
 * @returns {boolean} True if deletion was successful, false otherwise.
 */
export function deleteChat(chatId) {
    try {
        // 1. Remove the chat history item
        const chatKey = `${CHAT_PREFIX}${chatId}`;
        localStorage.removeItem(chatKey);

        // 2. Update the chat list metadata
        let chatList = getChatList();
        const initialLength = chatList.length;
        chatList = chatList.filter(chat => chat.id !== chatId);

        if (chatList.length < initialLength) {
            // Save the updated list only if an item was actually removed
            return saveChatList(chatList);
        } else {
            // Chat ID wasn't in the list, but history (if existed) was removed. Consider success.
            console.warn(`Chat ID ${chatId} not found in list during delete, but history key removed.`);
            return true;
        }
    } catch (error) {
        console.error(`Error deleting chat ${chatId}:`, error);
        return false;
    }
}

/**
 * Updates the title of a specific chat in the metadata list.
 * @param {string} chatId - The ID of the chat to update.
 * @param {string} newTitle - The new title for the chat.
 * @returns {boolean} True if the title was updated successfully, false otherwise.
 */
export function updateChatTitle(chatId, newTitle) {
    if (!newTitle || !newTitle.trim()) {
        console.warn("Attempted to update chat title with empty value.");
        return false;
    }
    try {
        const chatList = getChatList();
        const index = chatList.findIndex(chat => chat.id === chatId);
        if (index !== -1) {
            chatList[index].title = newTitle.trim();
            // Optionally update timestamp? Maybe not needed for just title change.
            // chatList[index].timestamp = Date.now();
            return saveChatList(chatList);
        } else {
            console.warn(`Chat ID ${chatId} not found in list during title update.`);
            return false;
        }
    } catch (error) {
        console.error(`Error updating title for chat ${chatId}:`, error);
        return false;
    }
}

/**
 * Deletes ALL chats and the chat list from localStorage. Use with caution!
 */
export function deleteAllChats() {
    try {
        const chatList = getChatList(); // Get the list before clearing it
        // Remove each individual chat history
        for (const chat of chatList) {
            localStorage.removeItem(`${CHAT_PREFIX}${chat.id}`);
        }
        // Remove the list itself
        localStorage.removeItem(CHAT_LIST_KEY);
        console.log("All chats deleted.");
        return true;
    } catch (error) {
        console.error("Error deleting all chats:", error);
        return false;
    }
}