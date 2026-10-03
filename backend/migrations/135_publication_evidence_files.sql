-- Migration 135: allow one publication evidence item to contain up to three files.
CREATE TABLE IF NOT EXISTS issue_publication_evidence_files (
  id BIGSERIAL PRIMARY KEY,
  evidence_id BIGINT NOT NULL REFERENCES issue_publication_evidence(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  file_order SMALLINT NOT NULL DEFAULT 1 CHECK (file_order BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(evidence_id,file_order)
);
CREATE INDEX IF NOT EXISTS idx_issue_publication_evidence_files_evidence ON issue_publication_evidence_files(evidence_id,file_order,id);
CREATE OR REPLACE FUNCTION enforce_issue_publication_evidence_file_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT count(*) FROM issue_publication_evidence_files WHERE evidence_id=NEW.evidence_id) >= 3 THEN
    RAISE EXCEPTION 'publication evidence supports maximum 3 files';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_issue_publication_evidence_file_limit ON issue_publication_evidence_files;
CREATE TRIGGER trg_issue_publication_evidence_file_limit BEFORE INSERT ON issue_publication_evidence_files FOR EACH ROW EXECUTE FUNCTION enforce_issue_publication_evidence_file_limit();
INSERT INTO issue_publication_evidence_files(evidence_id,storage_key,file_name,mime_type,file_order)
SELECT e.id,e.storage_key,e.file_name,e.mime_type,1 FROM issue_publication_evidence e
WHERE e.storage_key IS NOT NULL AND e.file_name IS NOT NULL AND e.mime_type IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM issue_publication_evidence_files f WHERE f.evidence_id=e.id);
