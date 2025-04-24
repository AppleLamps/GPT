-- Supabase SQL setup script for ChatGPT Clone with authentication and data storage

-- PART 1: Create all tables first
-- ==============================

-- Create API Keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create Settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    default_model TEXT NOT NULL DEFAULT 'gpt-4o',
    tts_instructions TEXT,
    tts_voice TEXT DEFAULT 'alloy',
    enable_html_sandbox BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create Chats table
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Custom GPTs table
CREATE TABLE IF NOT EXISTS public.custom_gpts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    capabilities JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Knowledge Files table
CREATE TABLE IF NOT EXISTS public.knowledge_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    custom_gpt_id UUID NOT NULL REFERENCES public.custom_gpts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PART 2: Create indexes for better performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON public.settings(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON public.chats(updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_custom_gpts_user_id ON public.custom_gpts(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_custom_gpt_id ON public.knowledge_files(custom_gpt_id);

-- PART 3: Create updated_at trigger function and triggers
-- ======================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to update the updated_at column
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at
BEFORE UPDATE ON public.chats
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_gpts_updated_at
BEFORE UPDATE ON public.custom_gpts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- PART 4: Enable Row Level Security (RLS) on all tables
-- ====================================================

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custom_gpts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.knowledge_files ENABLE ROW LEVEL SECURITY;

-- PART 5: Create RLS policies
-- ==========================

-- Create RLS policies for API Keys
CREATE POLICY "Users can only view their own API keys" 
    ON public.api_keys FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own API keys" 
    ON public.api_keys FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own API keys" 
    ON public.api_keys FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own API keys" 
    ON public.api_keys FOR DELETE 
    USING (auth.uid() = user_id);

-- Create RLS policies for Settings
CREATE POLICY "Users can only view their own settings" 
    ON public.settings FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own settings" 
    ON public.settings FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own settings" 
    ON public.settings FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own settings" 
    ON public.settings FOR DELETE 
    USING (auth.uid() = user_id);

-- Create RLS policies for Chats
CREATE POLICY "Users can only view their own chats" 
    ON public.chats FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own chats" 
    ON public.chats FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own chats" 
    ON public.chats FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own chats" 
    ON public.chats FOR DELETE 
    USING (auth.uid() = user_id);

-- Create RLS policies for Custom GPTs
CREATE POLICY "Users can only view their own custom GPTs" 
    ON public.custom_gpts FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own custom GPTs" 
    ON public.custom_gpts FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own custom GPTs" 
    ON public.custom_gpts FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own custom GPTs" 
    ON public.custom_gpts FOR DELETE 
    USING (auth.uid() = user_id);

-- Create RLS policies for Messages
-- For messages, we need to check the parent chat's user_id
CREATE POLICY "Users can only view messages from their own chats" 
    ON public.messages FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM public.chats 
        WHERE chats.id = messages.chat_id 
        AND chats.user_id = auth.uid()
    ));

CREATE POLICY "Users can only insert messages to their own chats" 
    ON public.messages FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.chats 
        WHERE chats.id = messages.chat_id 
        AND chats.user_id = auth.uid()
    ));

CREATE POLICY "Users can only update messages from their own chats" 
    ON public.messages FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM public.chats 
        WHERE chats.id = messages.chat_id 
        AND chats.user_id = auth.uid()
    ));

CREATE POLICY "Users can only delete messages from their own chats" 
    ON public.messages FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM public.chats 
        WHERE chats.id = messages.chat_id 
        AND chats.user_id = auth.uid()
    ));

-- Create RLS policies for Knowledge Files
-- For knowledge files, we need to check the parent custom GPT's user_id
CREATE POLICY "Users can only view knowledge files from their own custom GPTs" 
    ON public.knowledge_files FOR SELECT 
    USING (EXISTS (
        SELECT 1 FROM public.custom_gpts 
        WHERE custom_gpts.id = knowledge_files.custom_gpt_id 
        AND custom_gpts.user_id = auth.uid()
    ));

CREATE POLICY "Users can only insert knowledge files to their own custom GPTs" 
    ON public.knowledge_files FOR INSERT 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.custom_gpts 
        WHERE custom_gpts.id = knowledge_files.custom_gpt_id 
        AND custom_gpts.user_id = auth.uid()
    ));

CREATE POLICY "Users can only update knowledge files from their own custom GPTs" 
    ON public.knowledge_files FOR UPDATE 
    USING (EXISTS (
        SELECT 1 FROM public.custom_gpts 
        WHERE custom_gpts.id = knowledge_files.custom_gpt_id 
        AND custom_gpts.user_id = auth.uid()
    ));

CREATE POLICY "Users can only delete knowledge files from their own custom GPTs" 
    ON public.knowledge_files FOR DELETE 
    USING (EXISTS (
        SELECT 1 FROM public.custom_gpts 
        WHERE custom_gpts.id = knowledge_files.custom_gpt_id 
        AND custom_gpts.user_id = auth.uid()
    ));
