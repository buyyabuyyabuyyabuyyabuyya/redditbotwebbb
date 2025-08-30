-- Reddit Auto-Poster and Universal Relevance System Migration
-- This migration adds all tables and modifications needed for the enhanced Reddit outreach system

-- 1. Website Configurations Table
CREATE TABLE IF NOT EXISTS website_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}',
    negative_keywords TEXT[] DEFAULT '{}',
    business_context_terms TEXT[] DEFAULT '{}',
    customer_segments TEXT[] DEFAULT '{}',
    relevance_threshold DECIMAL(3,2) DEFAULT 0.70,
    auto_poster_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT website_configs_user_url_unique UNIQUE (user_id, url)
);

-- Enable RLS on website_configs
ALTER TABLE website_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies for website_configs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'website_configs' AND policyname = 'Users can view their own website configs') THEN
        CREATE POLICY "Users can view their own website configs" ON website_configs
            FOR SELECT USING (user_id = auth.uid()::text);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'website_configs' AND policyname = 'Users can insert their own website configs') THEN
        CREATE POLICY "Users can insert their own website configs" ON website_configs
            FOR INSERT WITH CHECK (user_id = auth.uid()::text);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'website_configs' AND policyname = 'Users can update their own website configs') THEN
        CREATE POLICY "Users can update their own website configs" ON website_configs
            FOR UPDATE USING (user_id = auth.uid()::text);
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'website_configs' AND policyname = 'Users can delete their own website configs') THEN
        CREATE POLICY "Users can delete their own website configs" ON website_configs
            FOR DELETE USING (user_id = auth.uid()::text);
    END IF;
END $$;

-- 2. Reddit Account Cooldowns Table
CREATE TABLE IF NOT EXISTS reddit_account_cooldowns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reddit_account_id UUID NOT NULL REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cooldown_until TIMESTAMP WITH TIME ZONE NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on reddit_account_cooldowns
ALTER TABLE reddit_account_cooldowns ENABLE ROW LEVEL SECURITY;

-- RLS policies for reddit_account_cooldowns (admin-managed)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reddit_account_cooldowns' AND policyname = 'System can manage account cooldowns') THEN
        CREATE POLICY "System can manage account cooldowns" ON reddit_account_cooldowns
            FOR ALL USING (true);
    END IF;
END $$;

-- 3. Add cooldown fields to reddit_accounts table
ALTER TABLE reddit_accounts 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS total_posts_made INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- 4. Reddit Pagination State Table
CREATE TABLE IF NOT EXISTS reddit_pagination_state (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subreddit TEXT NOT NULL,
    last_after_token TEXT,
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on reddit_pagination_state
ALTER TABLE reddit_pagination_state ENABLE ROW LEVEL SECURITY;

-- RLS policies for reddit_pagination_state (system-wide access)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reddit_pagination_state' AND policyname = 'System can manage pagination state') THEN
        CREATE POLICY "System can manage pagination state" ON reddit_pagination_state
            FOR ALL USING (true);
    END IF;
END $$;

-- 5. Posted Reddit Discussions Table
CREATE TABLE IF NOT EXISTS posted_reddit_discussions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    website_config_id UUID NOT NULL REFERENCES website_configs(id) ON DELETE CASCADE,
    reddit_post_id TEXT NOT NULL,
    subreddit TEXT NOT NULL,
    post_title TEXT DEFAULT '',
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reddit_account_id UUID REFERENCES reddit_accounts(id),
    comment_id TEXT,
    comment_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on posted_reddit_discussions
ALTER TABLE posted_reddit_discussions ENABLE ROW LEVEL SECURITY;

-- RLS policies for posted_reddit_discussions
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'posted_reddit_discussions' AND policyname = 'Users can view their posted discussions') THEN
        CREATE POLICY "Users can view their posted discussions" ON posted_reddit_discussions
            FOR SELECT USING (
                website_config_id IN (
                    SELECT id FROM website_configs WHERE user_id = auth.uid()::text
                )
            );
    END IF;
END $$;

-- 6. Relevance Scores Table (for analytics and optimization)
CREATE TABLE IF NOT EXISTS relevance_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discussion_id UUID REFERENCES discussions(id),
    website_config_id UUID NOT NULL REFERENCES website_configs(id) ON DELETE CASCADE,
    intent_score INTEGER DEFAULT 0,
    context_match_score INTEGER DEFAULT 0,
    quality_score INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0,
    final_relevance_score INTEGER DEFAULT 0,
    filtering_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on relevance_scores
ALTER TABLE relevance_scores ENABLE ROW LEVEL SECURITY;

-- RLS policies for relevance_scores
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'relevance_scores' AND policyname = 'Users can view their relevance scores') THEN
        CREATE POLICY "Users can view their relevance scores" ON relevance_scores
            FOR SELECT USING (
                website_config_id IN (
                    SELECT id FROM website_configs WHERE user_id = auth.uid()::text
                )
            );
    END IF;
END $$;

-- 7. Auto-Poster Configurations Table
CREATE TABLE IF NOT EXISTS auto_poster_configs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id TEXT,
    account_id UUID REFERENCES reddit_accounts(id),
    enabled BOOLEAN DEFAULT false,
    interval_minutes INTEGER DEFAULT 30,
    max_posts_per_day INTEGER DEFAULT 10,
    only_high_score_replies BOOLEAN DEFAULT true,
    min_relevance_score INTEGER DEFAULT 70,
    min_validation_score INTEGER DEFAULT 70,
    status TEXT DEFAULT 'inactive',
    last_posted_at TIMESTAMP WITH TIME ZONE,
    next_post_at TIMESTAMP WITH TIME ZONE,
    posts_today INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    website_config_id UUID REFERENCES website_configs(id),
    posting_interval_minutes INTEGER DEFAULT 30,
    require_tab_open BOOLEAN DEFAULT false
);

-- Enable RLS on auto_poster_configs
ALTER TABLE auto_poster_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies for auto_poster_configs
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'auto_poster_configs' AND policyname = 'Users can manage their own auto-poster configs') THEN
        CREATE POLICY "Users can manage their own auto-poster configs" ON auto_poster_configs
            FOR ALL USING (user_id = auth.uid()::text);
    END IF;
END $$;

-- 8. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_website_configs_user_id ON website_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_reddit_account_cooldowns_reddit_account_id ON reddit_account_cooldowns(reddit_account_id);
CREATE INDEX IF NOT EXISTS idx_reddit_account_cooldowns_cooldown_until ON reddit_account_cooldowns(cooldown_until);
CREATE INDEX IF NOT EXISTS idx_reddit_accounts_is_discussion_poster ON reddit_accounts(is_discussion_poster) WHERE is_discussion_poster = true;
CREATE INDEX IF NOT EXISTS idx_reddit_accounts_is_available ON reddit_accounts(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_reddit_pagination_state_subreddit ON reddit_pagination_state(subreddit);
CREATE INDEX IF NOT EXISTS idx_posted_reddit_discussions_website_config_id ON posted_reddit_discussions(website_config_id);
CREATE INDEX IF NOT EXISTS idx_posted_reddit_discussions_reddit_post_id ON posted_reddit_discussions(reddit_post_id);
CREATE INDEX IF NOT EXISTS idx_relevance_scores_website_config ON relevance_scores(website_config_id);
CREATE INDEX IF NOT EXISTS idx_auto_poster_configs_user_id ON auto_poster_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_poster_configs_enabled ON auto_poster_configs(enabled) WHERE enabled = true;

-- 9. Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. Add updated_at triggers
CREATE TRIGGER update_website_configs_updated_at BEFORE UPDATE ON website_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reddit_pagination_state_updated_at BEFORE UPDATE ON reddit_pagination_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_poster_configs_updated_at BEFORE UPDATE ON auto_poster_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Add helpful comments
COMMENT ON TABLE website_configs IS 'User-specific website configurations for Reddit outreach';
COMMENT ON TABLE reddit_account_cooldowns IS 'Tracks cooldown periods for Reddit accounts to prevent rate limiting';
COMMENT ON TABLE reddit_pagination_state IS 'Stores pagination state for efficient Reddit API fetching';
COMMENT ON TABLE posted_reddit_discussions IS 'Tracks which Reddit discussions have been posted to prevent duplicates';
COMMENT ON TABLE relevance_scores IS 'Stores relevance scoring data for analytics and optimization';
COMMENT ON TABLE auto_poster_configs IS 'Configuration for automated Reddit posting per website';

-- 12. Insert sample data for testing (optional - remove in production)
-- This can be uncommented for development/testing purposes
/*
INSERT INTO website_configs (user_id, url, description, keywords, customer_segments, relevance_threshold) VALUES
('sample_user_id', 'https://example.com', 'A productivity tool for small businesses', 
 ARRAY['productivity', 'business', 'automation'], 
 ARRAY['small business owners', 'entrepreneurs', 'freelancers'], 
 0.75);
*/
