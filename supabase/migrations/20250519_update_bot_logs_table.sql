-- Make account_id column nullable in bot_logs table
ALTER TABLE IF EXISTS public.bot_logs 
ALTER COLUMN account_id DROP NOT NULL;
