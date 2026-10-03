-- Migration 136: draft publication evidence may group files; save locks the evidence set.
ALTER TABLE issue_publication_evidence DROP CONSTRAINT IF EXISTS issue_publication_evidence_source_ck;
ALTER TABLE issue_publication_evidence ADD CONSTRAINT issue_publication_evidence_source_ck
CHECK ((evidence_type='WEBSITE' AND url IS NOT NULL) OR (evidence_type IN ('PDF','IMAGE') AND url IS NULL));
ALTER TABLE issue_workflows ADD COLUMN IF NOT EXISTS publication_evidence_saved_at TIMESTAMPTZ NULL;
ALTER TABLE issue_workflows ADD COLUMN IF NOT EXISTS publication_evidence_saved_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL;
