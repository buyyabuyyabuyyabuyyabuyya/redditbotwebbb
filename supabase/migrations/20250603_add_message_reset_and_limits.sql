-- Add monthly message count reset timestamp and ensure default values
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS message_count_reset_at TIMESTAMP WITH TIME ZONE;

-- Optional: initialize the column to first day of current month for existing Pro users
UPDATE users
SET message_count_reset_at = date_trunc('month', now())
WHERE subscription_status = 'pro' AND message_count_reset_at IS NULL;
