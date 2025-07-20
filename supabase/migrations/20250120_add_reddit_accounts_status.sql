-- Add status and banned_at columns to reddit_accounts table
ALTER TABLE reddit_accounts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Add index for better performance when filtering by status
CREATE INDEX IF NOT EXISTS idx_reddit_accounts_status ON reddit_accounts(status);

-- Update existing records to have 'active' status if they don't have one
UPDATE reddit_accounts 
SET status = 'active' 
WHERE status IS NULL;
