-- Modify auto_poster_configs table to link with website configs
ALTER TABLE auto_poster_configs ADD COLUMN IF NOT EXISTS website_config_id uuid REFERENCES website_configs(id) ON DELETE CASCADE;
ALTER TABLE auto_poster_configs ADD COLUMN IF NOT EXISTS posting_interval_minutes integer DEFAULT 30;
ALTER TABLE auto_poster_configs ADD COLUMN IF NOT EXISTS require_tab_open boolean DEFAULT true;

-- Add index for the new foreign key
CREATE INDEX IF NOT EXISTS idx_auto_poster_configs_website_config_id ON auto_poster_configs(website_config_id);
