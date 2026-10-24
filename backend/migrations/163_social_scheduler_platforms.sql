-- Platform selection belongs to the existing singleton scheduler configuration.
-- Preserve all previous choices and scheduler activation status.
ALTER TABLE collection_scheduler_config
 ADD COLUMN IF NOT EXISTS social_platforms TEXT[] NOT NULL
 DEFAULT ARRAY['youtube','instagram','tiktok']::text[];
