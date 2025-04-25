// API Key Fix Script
// Run this in the browser console to fix API key issues

(async function() {
    console.log('Starting API key fix script...');
    
    // Check if Supabase is available
    if (typeof supabase === 'undefined') {
        console.error('Supabase client not found. Make sure you run this on a page where Supabase is initialized.');
        return;
    }
    
    // Check authentication
    console.log('Checking authentication...');
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError) {
        console.error('Authentication error:', authError);
        return;
    }
    
    const user = session?.user;
    if (!user) {
        console.error('Not authenticated. Please sign in first.');
        return;
    }
    
    console.log(`Authenticated as ${user.email} (${user.id})`);
    
    // Get API keys from localStorage as a backup
    const localOpenAIKey = localStorage.getItem('openai_api_key') || '';
    const localGeminiKey = localStorage.getItem('google_gemini_api_key') || '';
    const localXAIKey = localStorage.getItem('xai_api_key') || '';
    
    console.log('API keys from localStorage:', {
        openai: localOpenAIKey ? 'Present' : 'Not found',
        gemini: localGeminiKey ? 'Present' : 'Not found',
        xai: localXAIKey ? 'Present' : 'Not found'
    });
    
    // Check if API keys exist in the database
    console.log('Checking API keys in database...');
    const { data: existingKeys, error: keysError } = await supabase
        .from('api_keys')
        .select('provider, encrypted_key')
        .eq('user_id', user.id);
    
    if (keysError) {
        console.error('Error checking API keys:', keysError);
        return;
    }
    
    console.log(`Found ${existingKeys?.length || 0} API keys in database`);
    
    // Prepare keys to save
    const keysToSave = [];
    
    // Add keys from localStorage if they don't exist in the database
    const existingProviders = (existingKeys || []).map(key => key.provider);
    
    if (localOpenAIKey && !existingProviders.includes('openai')) {
        console.log('Adding OpenAI key from localStorage');
        keysToSave.push({
            user_id: user.id,
            provider: 'openai',
            encrypted_key: localOpenAIKey
        });
    }
    
    if (localGeminiKey && !existingProviders.includes('gemini')) {
        console.log('Adding Gemini key from localStorage');
        keysToSave.push({
            user_id: user.id,
            provider: 'gemini',
            encrypted_key: localGeminiKey
        });
    }
    
    if (localXAIKey && !existingProviders.includes('xai')) {
        console.log('Adding XAI key from localStorage');
        keysToSave.push({
            user_id: user.id,
            provider: 'xai',
            encrypted_key: localXAIKey
        });
    }
    
    // Save keys if needed
    if (keysToSave.length > 0) {
        console.log(`Saving ${keysToSave.length} API keys to database...`);
        
        const { data, error } = await supabase
            .from('api_keys')
            .upsert(keysToSave, {
                onConflict: 'user_id,provider'
            });
        
        if (error) {
            console.error('Error saving API keys:', error);
        } else {
            console.log('API keys saved successfully');
        }
    } else {
        console.log('No new API keys to save');
    }
    
    // Verify API keys in database
    console.log('Verifying API keys in database...');
    const { data: updatedKeys, error: verifyError } = await supabase
        .from('api_keys')
        .select('provider, encrypted_key')
        .eq('user_id', user.id);
    
    if (verifyError) {
        console.error('Error verifying API keys:', verifyError);
        return;
    }
    
    console.log(`Found ${updatedKeys?.length || 0} API keys in database after fix`);
    
    if (updatedKeys && updatedKeys.length > 0) {
        console.log('API keys by provider:');
        updatedKeys.forEach(key => {
            console.log(`- ${key.provider}: ${key.encrypted_key.substring(0, 4)}...${key.encrypted_key.substring(key.encrypted_key.length - 4)}`);
        });
    }
    
    console.log('API key fix script completed');
    
    // Force reload settings in the app
    if (typeof state !== 'undefined' && typeof state.loadSettings === 'function') {
        console.log('Reloading app settings...');
        try {
            await state.loadSettings();
            console.log('App settings reloaded');
        } catch (error) {
            console.error('Error reloading app settings:', error);
        }
    }
    
    return {
        success: true,
        keysFound: updatedKeys?.length || 0,
        message: 'API key fix completed'
    };
})();
