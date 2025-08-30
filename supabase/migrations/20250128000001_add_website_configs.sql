-- Create website_configs table
CREATE TABLE website_configs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(user_id),
    product_id uuid REFERENCES products(id),
    website_url text NOT NULL,
    website_description text,
    customer_segments text[] DEFAULT '{}',
    target_keywords text[] DEFAULT '{}',
    negative_keywords text[] DEFAULT '{}',
    business_context_terms text[] DEFAULT '{}',
    relevance_threshold integer DEFAULT 70,
    auto_poster_enabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_website_configs_user_id ON website_configs(user_id);
CREATE INDEX idx_website_configs_product_id ON website_configs(product_id);
CREATE INDEX idx_website_configs_auto_poster_enabled ON website_configs(auto_poster_enabled);

-- Add RLS policies
ALTER TABLE website_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own website configs" ON website_configs
    FOR SELECT USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own website configs" ON website_configs
    FOR INSERT WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own website configs" ON website_configs
    FOR UPDATE USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete their own website configs" ON website_configs
    FOR DELETE USING (user_id = auth.jwt() ->> 'sub');
