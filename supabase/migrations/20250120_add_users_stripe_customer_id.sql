-- Add stripe_customer_id column to users table for subscription management
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add index for better performance when looking up by stripe customer ID
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
