-- 134: Multi-source publication evidence for Phase 3 response publication.
-- Files are stored in private Vercel Blob; this table stores only metadata/pointers.
CREATE TABLE IF NOT EXISTS issue_publication_evidence (
  id BIGSERIAL PRIMARY KEY,
  issue_id BIGINT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('WEBSITE','PDF','IMAGE')),
  channel TEXT NULL CHECK (channel IS NULL OR channel IN ('website','instagram','facebook','tiktok','youtube','x','threads','press_release','media_statement','other')),
  url TEXT NULL,
  storage_key TEXT NULL,
  file_name TEXT NULL,
  mime_type TEXT NULL CHECK (mime_type IS NULL OR mime_type IN ('application/pdf','image/jpeg','image/png')),
  caption TEXT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issue_publication_evidence_source_ck CHECK (
    (evidence_type='WEBSITE' AND url IS NOT NULL AND storage_key IS NULL)
    OR
    (evidence_type IN ('PDF','IMAGE') AND storage_key IS NOT NULL AND file_name IS NOT NULL AND mime_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_issue_publication_evidence_issue
  ON issue_publication_evidence(issue_id,created_at,id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_issue_publication_primary
  ON issue_publication_evidence(issue_id)
  WHERE is_primary=true;

CREATE OR REPLACE FUNCTION enforce_issue_publication_evidence_limit()
RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM issue_publication_evidence WHERE issue_id=NEW.issue_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum 5 publication evidence items per issue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_publication_evidence_limit ON issue_publication_evidence;
CREATE TRIGGER trg_issue_publication_evidence_limit
  BEFORE INSERT ON issue_publication_evidence
  FOR EACH ROW EXECUTE FUNCTION enforce_issue_publication_evidence_limit();
