-- Add config_id column to bot_logs table
ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS config_id UUID;

-- Add comment to the column
COMMENT ON COLUMN bot_logs.config_id IS 'The ID of the scan configuration that triggered this log entry';
