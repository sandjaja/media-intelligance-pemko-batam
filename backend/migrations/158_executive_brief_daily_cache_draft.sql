-- PREVIEW ONLY: executive brief cache and single-flight execution guard.
-- No scheduler is enabled by this migration.
CREATE TABLE IF NOT EXISTS executive_brief_daily_cache (
  brief_date DATE NOT NULL,
  scope_key TEXT NOT NULL DEFAULT 'city',
  status TEXT NOT NULL CHECK (status IN ('running','ready','failed')),
  brief_json JSONB,
  model_code TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_date,scope_key),
  CONSTRAINT executive_brief_ready_requires_data CHECK (status <> 'ready' OR (brief_json IS NOT NULL AND generated_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_executive_brief_cache_generated_at ON executive_brief_daily_cache(generated_at DESC);
