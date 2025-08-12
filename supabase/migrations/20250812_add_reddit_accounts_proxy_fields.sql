-- Add proxy fields to reddit_accounts table
ALTER TABLE reddit_accounts 
  ADD COLUMN IF NOT EXISTS proxy_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_type TEXT CHECK (proxy_type IN ('http','https','socks5')),
  ADD COLUMN IF NOT EXISTS proxy_host TEXT,
  ADD COLUMN IF NOT EXISTS proxy_port INT,
  ADD COLUMN IF NOT EXISTS proxy_username TEXT,
  ADD COLUMN IF NOT EXISTS proxy_password TEXT,
  ADD COLUMN IF NOT EXISTS proxy_status TEXT,
  ADD COLUMN IF NOT EXISTS proxy_last_checked TIMESTAMPTZ;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_reddit_accounts_proxy_enabled ON reddit_accounts(proxy_enabled);
CREATE INDEX IF NOT EXISTS idx_reddit_accounts_user_proxy ON reddit_accounts(user_id, proxy_enabled);

-- Initialize status for existing rows
UPDATE reddit_accounts SET proxy_status = COALESCE(proxy_status, 'disabled') WHERE proxy_enabled = false; 