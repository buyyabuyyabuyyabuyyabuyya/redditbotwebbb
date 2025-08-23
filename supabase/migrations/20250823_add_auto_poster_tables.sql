-- Auto-poster configuration table
CREATE TABLE auto_poster_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL, -- Beno product ID
  account_id UUID NOT NULL REFERENCES reddit_accounts(id) ON DELETE CASCADE,
  
  -- Settings
  enabled BOOLEAN DEFAULT false,
  interval_minutes INTEGER DEFAULT 30 CHECK (interval_minutes >= 15),
  max_posts_per_day INTEGER DEFAULT 10 CHECK (max_posts_per_day > 0),
  only_high_score_replies BOOLEAN DEFAULT true,
  min_relevance_score INTEGER DEFAULT 80 CHECK (min_relevance_score >= 0 AND min_relevance_score <= 100),
  min_validation_score INTEGER DEFAULT 75 CHECK (min_validation_score >= 0 AND min_validation_score <= 100),
  
  -- Status tracking
  status TEXT DEFAULT 'paused' CHECK (status IN ('active', 'paused', 'error')),
  last_posted_at TIMESTAMP WITH TIME ZONE,
  next_post_at TIMESTAMP WITH TIME ZONE,
  posts_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, product_id, account_id)
);

-- Auto-posting logs table
CREATE TABLE auto_posting_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES auto_poster_configs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Beno data
  beno_reply_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  
  -- Reddit data
  account_id UUID NOT NULL REFERENCES reddit_accounts(id) ON DELETE CASCADE,
  subreddit TEXT NOT NULL,
  post_id TEXT NOT NULL, -- Reddit post ID
  comment_id TEXT, -- Reddit comment ID (after posting)
  comment_url TEXT, -- Full Reddit comment URL
  
  -- Content
  reply_text TEXT NOT NULL,
  relevance_score INTEGER,
  validation_score INTEGER,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('pending', 'posted', 'failed', 'skipped')),
  error_message TEXT,
  skip_reason TEXT,
  
  -- Timing
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  posted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Background worker status table
CREATE TABLE background_worker_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_type TEXT NOT NULL CHECK (worker_type IN ('discovery', 'posting')),
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'error')),
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  
  -- Stats
  total_runs INTEGER DEFAULT 0,
  successful_runs INTEGER DEFAULT 0,
  failed_runs INTEGER DEFAULT 0,
  
  -- Current run info
  current_run_started_at TIMESTAMP WITH TIME ZONE,
  current_run_products_processed INTEGER DEFAULT 0,
  current_run_replies_generated INTEGER DEFAULT 0,
  current_run_posts_made INTEGER DEFAULT 0,
  
  -- Error tracking
  last_error_message TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(worker_type)
);

-- Indexes for performance
CREATE INDEX idx_auto_poster_configs_user_id ON auto_poster_configs(user_id);
CREATE INDEX idx_auto_poster_configs_enabled ON auto_poster_configs(enabled) WHERE enabled = true;
CREATE INDEX idx_auto_poster_configs_next_post ON auto_poster_configs(next_post_at) WHERE enabled = true AND next_post_at IS NOT NULL;

CREATE INDEX idx_auto_posting_logs_config_id ON auto_posting_logs(config_id);
CREATE INDEX idx_auto_posting_logs_user_id ON auto_posting_logs(user_id);
CREATE INDEX idx_auto_posting_logs_posted_at ON auto_posting_logs(posted_at);
CREATE INDEX idx_auto_posting_logs_status ON auto_posting_logs(status);

-- RLS Policies
ALTER TABLE auto_poster_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_posting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_worker_status ENABLE ROW LEVEL SECURITY;

-- Users can only see their own configs
CREATE POLICY "Users can view own auto poster configs" ON auto_poster_configs
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own auto poster configs" ON auto_poster_configs
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own auto poster configs" ON auto_poster_configs
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own auto poster configs" ON auto_poster_configs
  FOR DELETE USING (auth.uid()::text = user_id);

-- Users can only see their own logs
CREATE POLICY "Users can view own auto posting logs" ON auto_posting_logs
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Service can insert auto posting logs" ON auto_posting_logs
  FOR INSERT WITH CHECK (true);

-- Only service role can access worker status
CREATE POLICY "Service role can manage worker status" ON background_worker_status
  FOR ALL USING (auth.role() = 'service_role');

-- Function to reset daily post counts
CREATE OR REPLACE FUNCTION reset_daily_post_counts()
RETURNS void AS $$
BEGIN
  UPDATE auto_poster_configs 
  SET posts_today = 0, last_reset_date = CURRENT_DATE
  WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to update next_post_at when config changes
CREATE OR REPLACE FUNCTION update_next_post_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enabled = true AND (OLD.enabled = false OR OLD.interval_minutes != NEW.interval_minutes) THEN
    NEW.next_post_at = NOW() + (NEW.interval_minutes || ' minutes')::INTERVAL;
  ELSIF NEW.enabled = false THEN
    NEW.next_post_at = NULL;
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update next_post_at
CREATE TRIGGER update_auto_poster_next_post
  BEFORE UPDATE ON auto_poster_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_next_post_time();

-- Insert initial worker status records
INSERT INTO background_worker_status (worker_type, status) VALUES 
  ('discovery', 'idle'),
  ('posting', 'idle')
ON CONFLICT (worker_type) DO NOTHING;
