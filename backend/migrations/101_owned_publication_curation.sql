-- Owned Channel publication curation
-- Crawled owned website content enters as a candidate. Only approved records are
-- exposed as official publications to Owned Channel intelligence.
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS curation_status TEXT;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS curated_at TIMESTAMPTZ;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS curated_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE social_mentions ADD COLUMN IF NOT EXISTS curation_reason TEXT;

-- Preserve all historical owned records as official publications. Only content
-- discovered after this migration enters the candidate queue.
UPDATE social_mentions SET curation_status='approved' WHERE source_kind='owned' AND curation_status IS NULL;

DO $$ BEGIN
  ALTER TABLE social_mentions ADD CONSTRAINT social_mentions_curation_status_check
    CHECK (curation_status IS NULL OR curation_status IN ('candidate','approved','ignored'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_mentions_owned_curation
  ON social_mentions(source_kind,curation_status,published_at DESC NULLS LAST,captured_at DESC);
