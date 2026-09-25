-- Complete issue_metrics for event-driven Issue Risk snapshots.
-- Backward compatible: keep all existing legacy metric columns intact.

ALTER TABLE issue_metrics
  ADD COLUMN IF NOT EXISTS media_volume INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_volume INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neutral_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS influence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_issue_metrics_issue_time
  ON issue_metrics(issue_id, measured_at DESC);
