-- Create reddit_account_cooldowns table
CREATE TABLE reddit_account_cooldowns (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    reddit_account_id uuid NOT NULL REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    last_used_at timestamp with time zone,
    cooldown_until timestamp with time zone,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Add unique constraint to ensure one cooldown record per account
ALTER TABLE reddit_account_cooldowns ADD CONSTRAINT unique_account_cooldown 
    UNIQUE (reddit_account_id);

-- Add indexes for performance
CREATE INDEX idx_reddit_account_cooldowns_account_id ON reddit_account_cooldowns(reddit_account_id);
CREATE INDEX idx_reddit_account_cooldowns_is_available ON reddit_account_cooldowns(is_available);
CREATE INDEX idx_reddit_account_cooldowns_cooldown_until ON reddit_account_cooldowns(cooldown_until);

-- Add columns to existing reddit_accounts table
ALTER TABLE reddit_accounts ADD COLUMN IF NOT EXISTS current_cooldown_until timestamp with time zone;
ALTER TABLE reddit_accounts ADD COLUMN IF NOT EXISTS total_messages_sent integer DEFAULT 0;
ALTER TABLE reddit_accounts ADD COLUMN IF NOT EXISTS last_message_sent_at timestamp with time zone;

-- Add RLS policies
ALTER TABLE reddit_account_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cooldowns for their accounts" ON reddit_account_cooldowns
    FOR SELECT USING (
        reddit_account_id IN (
            SELECT id FROM reddit_accounts WHERE user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "System can manage all cooldowns" ON reddit_account_cooldowns
    FOR ALL USING (true);
