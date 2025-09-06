-- Create gemini_quota_tracking table for managing API quotas
CREATE TABLE IF NOT EXISTS gemini_quota_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  requests_used INTEGER DEFAULT 0,
  daily_limit INTEGER DEFAULT 200,
  is_quota_exceeded BOOLEAN DEFAULT FALSE,
  last_request_at TIMESTAMP WITH TIME ZONE,
  quota_exceeded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient date queries
CREATE INDEX IF NOT EXISTS idx_gemini_quota_date ON gemini_quota_tracking(date);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_gemini_quota_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_gemini_quota_updated_at
  BEFORE UPDATE ON gemini_quota_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_gemini_quota_updated_at();
