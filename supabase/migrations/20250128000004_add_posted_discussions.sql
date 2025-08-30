-- Create posted_reddit_discussions table
CREATE TABLE posted_reddit_discussions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    website_config_id uuid NOT NULL REFERENCES website_configs(id) ON DELETE CASCADE,
    reddit_post_id text NOT NULL,
    subreddit text NOT NULL,
    post_title text,
    posted_at timestamp with time zone DEFAULT now(),
    reddit_account_id uuid NOT NULL REFERENCES reddit_accounts(id),
    comment_id text,
    comment_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- Add unique constraint to prevent duplicate posts per website config
ALTER TABLE posted_reddit_discussions ADD CONSTRAINT unique_website_post 
    UNIQUE (website_config_id, reddit_post_id);

-- Add indexes for performance
CREATE INDEX idx_posted_discussions_website_config ON posted_reddit_discussions(website_config_id);
CREATE INDEX idx_posted_discussions_reddit_post_id ON posted_reddit_discussions(reddit_post_id);
CREATE INDEX idx_posted_discussions_subreddit ON posted_reddit_discussions(subreddit);
CREATE INDEX idx_posted_discussions_posted_at ON posted_reddit_discussions(posted_at);

-- Add RLS policies
ALTER TABLE posted_reddit_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their posted discussions" ON posted_reddit_discussions
    FOR SELECT USING (
        website_config_id IN (
            SELECT id FROM website_configs WHERE user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "System can manage all posted discussions" ON posted_reddit_discussions
    FOR ALL USING (true);
