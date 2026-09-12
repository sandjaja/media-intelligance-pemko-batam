-- Human review/override for Owned Channel amplification relationships.
-- Automatic clustering remains the default; Humas/Super Admin can override exceptions.
ALTER TABLE owned_content_cluster_members ADD COLUMN IF NOT EXISTS review_status TEXT;
ALTER TABLE owned_content_cluster_members ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE owned_content_cluster_members ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE owned_content_cluster_members ADD COLUMN IF NOT EXISTS review_reason TEXT;

DO $$ BEGIN
  ALTER TABLE owned_content_cluster_members ADD CONSTRAINT owned_cluster_member_review_status_check
    CHECK (review_status IS NULL OR review_status IN ('confirmed','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_owned_cluster_members_review_status
  ON owned_content_cluster_members(review_status, similarity_score);
