-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL UNIQUE,
  subscription_status TEXT NOT NULL DEFAULT 'free',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create reddit_accounts table
CREATE TABLE IF NOT EXISTS reddit_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  username TEXT NOT NULL,
  password TEXT,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  is_validated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create sent_messages table
CREATE TABLE IF NOT EXISTS sent_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  account_id UUID NOT NULL REFERENCES reddit_accounts(id),
  recipient TEXT NOT NULL,
  subreddit TEXT NOT NULL,
  message_template TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create message_templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create RLS policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reddit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own data"
  ON users FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  USING (auth.uid()::text = user_id);

-- Reddit accounts policies
CREATE POLICY "Users can view their own accounts"
  ON reddit_accounts FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own accounts"
  ON reddit_accounts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own accounts"
  ON reddit_accounts FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own accounts"
  ON reddit_accounts FOR DELETE
  USING (auth.uid()::text = user_id);

-- Sent messages policies
CREATE POLICY "Users can view their own sent messages"
  ON sent_messages FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own sent messages"
  ON sent_messages FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Message templates policies
CREATE POLICY "Users can view their own message templates"
  ON message_templates FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own message templates"
  ON message_templates FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own message templates"
  ON message_templates FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own message templates"
  ON message_templates FOR DELETE
  USING (auth.uid()::text = user_id);





-- Create scan_configs table
CREATE TABLE IF NOT EXISTS scan_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  subreddit TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  message_template_id UUID NOT NULL REFERENCES message_templates(id),
  reddit_account_id UUID NOT NULL REFERENCES reddit_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  scan_interval INTEGER NOT NULL DEFAULT 30,
  last_scan_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE scan_configs ENABLE ROW LEVEL SECURITY;

-- Scan configs policies
CREATE POLICY "Users can view their own scan configs"
  ON scan_configs FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own scan configs"
  ON scan_configs FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own scan configs"
  ON scan_configs FOR UPDATE
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own scan configs"
  ON scan_configs FOR DELETE
  USING (auth.uid()::text = user_id);