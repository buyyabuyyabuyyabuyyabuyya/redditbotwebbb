-- Add credential_error_at column to reddit_accounts table
-- This tracks when an account had credential issues (401 Unauthorized)
ALTER TABLE reddit_accounts 
ADD COLUMN IF NOT EXISTS credential_error_at TIMESTAMP WITH TIME ZONE;

-- Add comment
COMMENT ON COLUMN reddit_accounts.credential_error_at IS 'Timestamp when account credentials became invalid (401 errors)';

-- Update existing accounts with credential_error status to have a timestamp
UPDATE reddit_accounts 
SET credential_error_at = NOW() 
WHERE status = 'credential_error' AND credential_error_at IS NULL;
