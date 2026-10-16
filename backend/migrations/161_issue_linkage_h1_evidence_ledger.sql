-- Per-evidence H-1 quota safety ledger. No scheduler or Gemini execution.
-- Evidence is reserved before an AI request; failed/uncertain reservations
-- must be reconciled manually, never retried automatically.
CREATE TABLE IF NOT EXISTS issue_linkage_h1_evidence_ledger (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  news_date DATE NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('online','print','social','owned')),
  source_id BIGINT NOT NULL CHECK (source_id > 0),
  batch_id BIGINT NOT NULL REFERENCES issue_linkage_h1_batches(id),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','completed','uncertain')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organization_id,news_date,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_issue_linkage_h1_evidence_batch
  ON issue_linkage_h1_evidence_ledger (batch_id,status);
