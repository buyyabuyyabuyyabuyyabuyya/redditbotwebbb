-- Create reddit_pagination_state table
CREATE TABLE reddit_pagination_state (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    subreddit text NOT NULL,
    last_after_token text,
    last_fetched_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Add unique constraint to ensure one pagination state per subreddit
ALTER TABLE reddit_pagination_state ADD CONSTRAINT unique_subreddit_pagination 
    UNIQUE (subreddit);

-- Add indexes for performance
CREATE INDEX idx_reddit_pagination_state_subreddit ON reddit_pagination_state(subreddit);
CREATE INDEX idx_reddit_pagination_state_last_fetched ON reddit_pagination_state(last_fetched_at);

-- Add RLS policies
ALTER TABLE reddit_pagination_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System can manage all pagination state" ON reddit_pagination_state
    FOR ALL USING (true);
