-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Add comment to the column
COMMENT ON COLUMN users.is_admin IS 'Indicates if the user has admin privileges';

-- Set the current user as admin (optional - you can remove this if you want to set admin manually)
UPDATE users 
SET is_admin = true 
WHERE id = (SELECT id FROM users LIMIT 1);
