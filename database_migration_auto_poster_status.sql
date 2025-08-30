-- Create auto_poster_status table
CREATE TABLE IF NOT EXISTS auto_poster_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    website_config_id UUID NOT NULL REFERENCES website_configs(id) ON DELETE CASCADE,
    is_running BOOLEAN DEFAULT false,
    started_at TIMESTAMPTZ,
    stopped_at TIMESTAMPTZ,
    next_post_time TIMESTAMPTZ,
    posts_today INTEGER DEFAULT 0,
    last_post_result TEXT,
    should_post_immediately BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one status per user per website config
    UNIQUE(user_id, website_config_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_auto_poster_status_user_running 
ON auto_poster_status(user_id, is_running);

CREATE INDEX IF NOT EXISTS idx_auto_poster_status_next_post 
ON auto_poster_status(next_post_time) WHERE is_running = true;
