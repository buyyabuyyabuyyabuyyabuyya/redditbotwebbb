-- Add pagination tracking columns to reddit_pagination_state table
ALTER TABLE reddit_pagination_state
ADD COLUMN IF NOT EXISTS pages_processed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS should_reset BOOLEAN DEFAULT false;

-- Create index for faster lookups on last_reset_at
CREATE INDEX IF NOT EXISTS idx_reddit_pagination_last_reset 
ON reddit_pagination_state (last_reset_at);

-- Add comment for documentation
COMMENT ON COLUMN reddit_pagination_state.pages_processed IS 'Number of pages processed since last reset';
COMMENT ON COLUMN reddit_pagination_state.last_reset_at IS 'Timestamp of last pagination reset to page 1';
COMMENT ON COLUMN reddit_pagination_state.should_reset IS 'Flag to force reset to page 1 on next run';
