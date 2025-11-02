-- Fix reddit_pagination_state table schema to match the code expectations
-- Drop old constraint first
ALTER TABLE reddit_pagination_state DROP CONSTRAINT IF EXISTS unique_subreddit_pagination;

-- Add missing columns
ALTER TABLE reddit_pagination_state 
ADD COLUMN IF NOT EXISTS user_id text,
ADD COLUMN IF NOT EXISTS auto_poster_config_id uuid,
ADD COLUMN IF NOT EXISTS after text,
ADD COLUMN IF NOT EXISTS before text,
ADD COLUMN IF NOT EXISTS total_fetched integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_fetched timestamp with time zone DEFAULT now();

-- Rename old columns to match new schema
ALTER TABLE reddit_pagination_state 
RENAME COLUMN last_after_token TO after_old;

ALTER TABLE reddit_pagination_state 
RENAME COLUMN last_fetched_at TO last_fetched_old;

-- Copy data from old columns to new (if any exists)
UPDATE reddit_pagination_state 
SET after = after_old, 
    last_fetched = last_fetched_old
WHERE after IS NULL;

-- Drop old columns
ALTER TABLE reddit_pagination_state 
DROP COLUMN IF EXISTS after_old,
DROP COLUMN IF EXISTS last_fetched_old;

-- Add new unique constraint for per-user, per-subreddit, per-config pagination
-- This allows different users and configs to have separate pagination states
ALTER TABLE reddit_pagination_state 
ADD CONSTRAINT unique_user_subreddit_config_pagination 
UNIQUE NULLS NOT DISTINCT (user_id, subreddit, auto_poster_config_id);

-- Add indexes for performance
DROP INDEX IF EXISTS idx_reddit_pagination_state_subreddit;
DROP INDEX IF EXISTS idx_reddit_pagination_state_last_fetched;

CREATE INDEX IF NOT EXISTS idx_reddit_pagination_user_subreddit 
ON reddit_pagination_state(user_id, subreddit);

CREATE INDEX IF NOT EXISTS idx_reddit_pagination_config 
ON reddit_pagination_state(auto_poster_config_id);

CREATE INDEX IF NOT EXISTS idx_reddit_pagination_last_fetched 
ON reddit_pagination_state(last_fetched);

-- Update RLS policy (already exists, just ensure it's correct)
DROP POLICY IF EXISTS "System can manage all pagination state" ON reddit_pagination_state;

CREATE POLICY "System can manage all pagination state" ON reddit_pagination_state
FOR ALL USING (true);
