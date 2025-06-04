-- Create bot_logs table
CREATE TABLE IF NOT EXISTS bot_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  account_id UUID NOT NULL REFERENCES reddit_accounts(id),
  recipient TEXT,
  subreddit TEXT NOT NULL,
  message_template TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable row-level security
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Bot logs policies
CREATE POLICY "Users can view their own bot logs"
  ON bot_logs FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own bot logs"
  ON bot_logs FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);
