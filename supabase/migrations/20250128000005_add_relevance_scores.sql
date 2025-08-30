-- Create relevance_scores table
CREATE TABLE relevance_scores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    discussion_id uuid REFERENCES discussions(id) ON DELETE CASCADE,
    website_config_id uuid NOT NULL REFERENCES website_configs(id) ON DELETE CASCADE,
    intent_score integer DEFAULT 0,
    context_match_score integer DEFAULT 0,
    quality_score integer DEFAULT 0,
    engagement_score integer DEFAULT 0,
    final_relevance_score integer DEFAULT 0,
    filtering_reason text,
    created_at timestamp with time zone DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_relevance_scores_discussion_id ON relevance_scores(discussion_id);
CREATE INDEX idx_relevance_scores_website_config_id ON relevance_scores(website_config_id);
CREATE INDEX idx_relevance_scores_final_score ON relevance_scores(final_relevance_score);

-- Add RLS policies
ALTER TABLE relevance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their relevance scores" ON relevance_scores
    FOR SELECT USING (
        website_config_id IN (
            SELECT id FROM website_configs WHERE user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "System can manage all relevance scores" ON relevance_scores
    FOR ALL USING (true);
