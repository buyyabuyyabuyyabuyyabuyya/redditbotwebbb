-- Add subreddit rotation tracking and relevance scores to auto_poster_configs
ALTER TABLE auto_poster_configs 
ADD COLUMN IF NOT EXISTS current_subreddit_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_subreddit_used TEXT DEFAULT 'entrepreneur';

-- Add relevance score columns to posted_reddit_discussions
ALTER TABLE posted_reddit_discussions
ADD COLUMN IF NOT EXISTS relevance_score INTEGER,
ADD COLUMN IF NOT EXISTS intent_score INTEGER,
ADD COLUMN IF NOT EXISTS context_match_score INTEGER,
ADD COLUMN IF NOT EXISTS quality_score INTEGER,
ADD COLUMN IF NOT EXISTS engagement_score INTEGER,
ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS comment_text TEXT,
ADD COLUMN IF NOT EXISTS reddit_account_id TEXT,
ADD COLUMN IF NOT EXISTS reddit_account_username TEXT;

-- Update existing configs to have proper defaults
UPDATE auto_poster_configs 
SET current_subreddit_index = 0, last_subreddit_used = 'entrepreneur'
WHERE current_subreddit_index IS NULL;
