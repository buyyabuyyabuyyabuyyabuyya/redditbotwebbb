-- Create queued_reddit_posts table for storing relevant posts to be posted later
CREATE TABLE IF NOT EXISTS queued_reddit_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID REFERENCES auto_poster_configs(id) ON DELETE CASCADE,
  reddit_post_id TEXT NOT NULL,
  reddit_post_title TEXT NOT NULL,
  reddit_post_url TEXT NOT NULL,
  reddit_post_content TEXT,
  subreddit TEXT NOT NULL,
  relevance_score DECIMAL(5,2) NOT NULL,
  intent_score DECIMAL(5,2),
  context_match_score DECIMAL(5,2),
  quality_score DECIMAL(5,2),
  engagement_score DECIMAL(5,2),
  priority INTEGER DEFAULT 1,
  queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  post_status TEXT DEFAULT 'queued' CHECK (post_status IN ('queued', 'posted', 'failed', 'skipped')),
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_queued_posts_config_status ON queued_reddit_posts(config_id, post_status);
CREATE INDEX IF NOT EXISTS idx_queued_posts_priority_score ON queued_reddit_posts(priority DESC, relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_queued_posts_queued_at ON queued_reddit_posts(queued_at);
CREATE INDEX IF NOT EXISTS idx_queued_posts_reddit_id ON queued_reddit_posts(reddit_post_id);

-- Prevent duplicate posts in queue
CREATE UNIQUE INDEX IF NOT EXISTS idx_queued_posts_unique ON queued_reddit_posts(config_id, reddit_post_id);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_queued_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_queued_posts_updated_at
  BEFORE UPDATE ON queued_reddit_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_queued_posts_updated_at();
