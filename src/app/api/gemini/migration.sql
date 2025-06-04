-- Create API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
    model VARCHAR(50) NOT NULL DEFAULT 'gemini-1.5-pro',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    rate_limit_reset TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add comment to the table
COMMENT ON TABLE api_keys IS 'Stores API keys for various AI providers with rotation and usage tracking';

-- Add RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Create policy for admin users only
CREATE POLICY admin_api_keys ON api_keys
    USING (auth.uid() IN (SELECT id FROM users WHERE is_admin = true));

-- Create index on provider and is_active for faster queries
CREATE INDEX idx_api_keys_provider_active ON api_keys(provider, is_active);
