/**
 * Renders search results with improved formatting for both mobile and desktop
 * @param {Object} searchData - The search data including query and results
 * @returns {HTMLElement} The formatted search results container
 */
export function renderImprovedWebSearchResults(searchData) {
    const container = document.createElement('div');
    container.className = 'web-search-container';
    
    // If we have a search query context (like "Latest news on X")
    if (searchData.query) {
        const contextPill = document.createElement('div');
        contextPill.className = 'search-context-pill';
        contextPill.textContent = `Latest news on ${searchData.query}`;
        container.appendChild(contextPill);
    }
    
    // Create the main article for the first/primary result
    if (searchData.results && searchData.results.length > 0) {
        const mainResult = searchData.results[0];
        
        const article = document.createElement('div');
        article.className = 'web-search-article';
        
        // Title section
        const title = document.createElement('h2');
        title.className = 'web-search-title';
        title.textContent = mainResult.title || '';
        article.appendChild(title);
        
        // Content section
        const content = document.createElement('div');
        content.className = 'web-search-content';
        content.innerHTML = mainResult.content || mainResult.summary || '';
        article.appendChild(content);
        
        // Footer with source and metadata
        const footer = document.createElement('div');
        footer.className = 'web-search-footer';
        
        // Source link
        const source = document.createElement('a');
        source.className = 'web-search-source';
        source.href = mainResult.url;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        
        // Extract domain for display
        let domain = '';
        try {
            if (mainResult.url) {
                const url = new URL(mainResult.url);
                domain = url.hostname.replace('www.', '');
            }
        } catch (e) {
            domain = mainResult.source || 'Source';
        }
        
        source.textContent = domain;
        footer.appendChild(source);
        
        // Add metadata if available
        if (mainResult.date || mainResult.metadata) {
            const metadata = document.createElement('span');
            metadata.className = 'web-search-metadata';
            metadata.textContent = mainResult.date || mainResult.metadata || '';
            footer.appendChild(metadata);
        }
        
        article.appendChild(footer);
        
        // Add action buttons (like, copy, etc.)
        const actions = document.createElement('div');
        actions.className = 'web-search-actions';
        
        // Like/upvote button
        const likeBtn = document.createElement('button');
        likeBtn.className = 'web-search-action-btn';
        likeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
            </svg>
        `;
        actions.appendChild(likeBtn);
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'web-search-action-btn';
        copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        actions.appendChild(copyBtn);
        
        // Share button
        const shareBtn = document.createElement('button');
        shareBtn.className = 'web-search-action-btn';
        shareBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
        `;
        actions.appendChild(shareBtn);
        
        article.appendChild(actions);
        container.appendChild(article);
    }
    
    return container;
} 