-- Manual paid-provider balance snapshots (absolute remaining balance).
-- This migration is a draft until reviewed and applied to Preview.
CREATE TABLE IF NOT EXISTS ai_provider_balance_snapshots (
 id BIGSERIAL PRIMARY KEY,
 provider_id BIGINT NOT NULL REFERENCES ai_providers(id),
 balance_usd NUMERIC(18,8) NOT NULL CHECK (balance_usd >= 0),
 committed_baseline_usd NUMERIC(18,8) NOT NULL CHECK (committed_baseline_usd >= 0),
 reason TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
 recorded_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_balance_snapshots_latest
 ON ai_provider_balance_snapshots(provider_id,id DESC);
