-- Migration: Add Beno One style tables for discussion posting
-- Date: 2025-01-01
-- Description: Creates tables for products, discussions, and discussion replies

-- 1. Create products table to store website data and AI descriptions
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    scraped_content JSONB, -- Raw scraped website data
    ai_description TEXT, -- AI-generated product description
    customer_segments TEXT[], -- Array of 4 customer segment options
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create discussions table to track Reddit posts we're monitoring
CREATE TABLE IF NOT EXISTS discussions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    subreddit TEXT NOT NULL,
    post_id TEXT NOT NULL, -- Reddit's post ID
    title TEXT,
    content TEXT,
    author TEXT,
    relevance_score INTEGER CHECK (relevance_score >= 1 AND relevance_score <= 10), -- 1-10 scale
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'failed', 'skipped')),
    post_url TEXT, -- Full Reddit post URL
    post_created_at TIMESTAMPTZ, -- When the Reddit post was created
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique posts per product
    UNIQUE(product_id, post_id)
);

-- 3. Create discussion_replies table to store our generated replies
CREATE TABLE IF NOT EXISTS discussion_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    reddit_account_id UUID NOT NULL REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    reply_content TEXT NOT NULL,
    reddit_comment_id TEXT, -- Reddit's comment ID after posting
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed', 'removed')),
    error_message TEXT, -- Store any error messages
    posted_at TIMESTAMPTZ, -- When the reply was actually posted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one reply per account per discussion
    UNIQUE(discussion_id, reddit_account_id)
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_url ON products(url);
CREATE INDEX IF NOT EXISTS idx_discussions_product_id ON discussions(product_id);
CREATE INDEX IF NOT EXISTS idx_discussions_subreddit ON discussions(subreddit);
CREATE INDEX IF NOT EXISTS idx_discussions_status ON discussions(status);
CREATE INDEX IF NOT EXISTS idx_discussions_relevance_score ON discussions(relevance_score);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id ON discussion_replies(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_reddit_account_id ON discussion_replies(reddit_account_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_status ON discussion_replies(status);

-- 5. Add RLS (Row Level Security) policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_replies ENABLE ROW LEVEL SECURITY;

-- Products: Users can only see their own products
CREATE POLICY "Users can view own products" ON products
    FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own products" ON products
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own products" ON products
    FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own products" ON products
    FOR DELETE USING (auth.uid()::text = user_id);

-- Discussions: Users can only see discussions for their own products
CREATE POLICY "Users can view own discussions" ON discussions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM products 
            WHERE products.id = discussions.product_id 
            AND products.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert own discussions" ON discussions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM products 
            WHERE products.id = discussions.product_id 
            AND products.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can update own discussions" ON discussions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM products 
            WHERE products.id = discussions.product_id 
            AND products.user_id = auth.uid()::text
        )
    );

-- Discussion replies: Users can only see replies for their own discussions
CREATE POLICY "Users can view own discussion replies" ON discussion_replies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM discussions 
            JOIN products ON discussions.product_id = products.id
            WHERE discussions.id = discussion_replies.discussion_id 
            AND products.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can insert own discussion replies" ON discussion_replies
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM discussions 
            JOIN products ON discussions.product_id = products.id
            WHERE discussions.id = discussion_replies.discussion_id 
            AND products.user_id = auth.uid()::text
        )
    );

CREATE POLICY "Users can update own discussion replies" ON discussion_replies
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM discussions 
            JOIN products ON discussions.product_id = products.id
            WHERE discussions.id = discussion_replies.discussion_id 
            AND products.user_id = auth.uid()::text
        )
    );

-- 6. Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. Add updated_at triggers to all tables
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussions_updated_at 
    BEFORE UPDATE ON discussions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discussion_replies_updated_at 
    BEFORE UPDATE ON discussion_replies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Add comments for documentation
COMMENT ON TABLE products IS 'Stores website data, AI descriptions, and customer segments for Beno One style workflow';
COMMENT ON TABLE discussions IS 'Tracks Reddit posts being monitored for relevance to products';
COMMENT ON TABLE discussion_replies IS 'Stores generated replies to Reddit discussions with posting status';
COMMENT ON COLUMN products.customer_segments IS 'Array of 4 customer segment options for targeting';
COMMENT ON COLUMN discussions.relevance_score IS 'AI-generated relevance score from 1-10';
COMMENT ON COLUMN discussion_replies.status IS 'Status of reply: pending, posted, failed, or removed'; 