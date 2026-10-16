-- H-1 Issue Linkage batch execution ledger. Schema only; no scheduler or live Gemini execution.
-- One row per organization, Jakarta news date and deterministic evidence fingerprint.
CREATE TABLE IF NOT EXISTS issue_linkage_h1_batches (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  news_date DATE NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  evidence_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, news_date, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_issue_linkage_h1_batches_recent
  ON issue_linkage_h1_batches (organization_id, news_date DESC, created_at DESC);
-- Future execution route must atomically claim a row with a conditional UPDATE,
-- and must never retry completed fingerprints or active unexpired leases.
