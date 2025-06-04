-- Add analysis_data column to sent_messages table
ALTER TABLE sent_messages ADD COLUMN IF NOT EXISTS analysis_data JSONB;

-- Add analysis_data column to bot_logs table
ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS analysis_data JSONB;

-- Add error_message column to bot_logs table for better error tracking
ALTER TABLE bot_logs ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add comment to the columns
COMMENT ON COLUMN sent_messages.analysis_data IS 'JSON data from Gemini API analysis';
COMMENT ON COLUMN bot_logs.analysis_data IS 'JSON data from Gemini API analysis';
COMMENT ON COLUMN bot_logs.error_message IS 'Error message if the action failed';
