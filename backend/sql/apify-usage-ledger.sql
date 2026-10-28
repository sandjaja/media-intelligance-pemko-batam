-- Apify usage ledger. Run on the intended Neon branch after review.
-- No existing table is modified.
CREATE TABLE IF NOT EXISTS apify_usage_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_key TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  run_id TEXT UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok','instagram')),
  status TEXT NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED','RUNNING','SUCCEEDED','FAILED','UNKNOWN')),
  reserved_usd NUMERIC(14,6) NOT NULL CHECK (reserved_usd >= 0),
  actual_usd NUMERIC(14,6) CHECK (actual_usd >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT apify_usage_run_required CHECK (
    status NOT IN ('RUNNING','SUCCEEDED','FAILED') OR run_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS apify_usage_ledger_started_at_idx
  ON apify_usage_ledger(started_at);
CREATE INDEX IF NOT EXISTS apify_usage_ledger_status_idx
  ON apify_usage_ledger(status);
-- Accounting rule: UNKNOWN and RUNNING must retain their reserved amounts
-- until reconciled with Apify. Do not release reservation on network timeout.
-- Atomic reservation and provider cost reconciliation are NOT implemented here.
