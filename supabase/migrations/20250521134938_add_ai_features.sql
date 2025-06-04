-- Add AI features to scan_configs table
-- Add AI-related columns to existing tables
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS ai_prompt TEXT;
ALTER TABLE scan_configs ADD COLUMN IF NOT EXISTS use_ai_check BOOLEAN DEFAULT true;

-- Make sure api_keys table structure is correct
DO $$ 
BEGIN
    -- Check if table exists, if not create it
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'api_keys') THEN
        CREATE TABLE api_keys (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            key TEXT NOT NULL,
            provider VARCHAR(50) NOT NULL,
            model VARCHAR(50),
            is_active BOOLEAN DEFAULT true,
            last_used TIMESTAMPTZ,
            rate_limit_reset TIMESTAMPTZ,
            usage_count INT4 DEFAULT 0,
            error_count INT4 DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Enable RLS on the new table
        ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
        
        -- Create policies for the new table
        CREATE POLICY "Admin users can view API keys" 
            ON api_keys FOR SELECT 
            USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
            
        CREATE POLICY "Admin users can insert API keys" 
            ON api_keys FOR INSERT 
            WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
            
        CREATE POLICY "Admin users can update API keys" 
            ON api_keys FOR UPDATE 
            USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
            
        CREATE POLICY "Admin users can delete API keys" 
            ON api_keys FOR DELETE 
            USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true));
    END IF;
END $$;

-- Note: API keys are managed by admin users only
-- All necessary policies are created in the DO block above
