-- Draft migration only. Do not apply to Production without approval.
-- Gemini free-tier daily request allowance, configured per model in the database.
-- An atomic upsert reserves one request before any external API invocation.
CREATE TABLE IF NOT EXISTS ai_free_tier_daily_limits (
  model_id BIGINT PRIMARY KEY REFERENCES ai_models(id) ON DELETE CASCADE,
  max_requests INTEGER NOT NULL CHECK (max_requests > 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_free_tier_daily_usage (
  model_id BIGINT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  reserved_requests INTEGER NOT NULL DEFAULT 0 CHECK (reserved_requests >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, usage_date)
);

-- Example reservation transaction (for backend implementation):
-- INSERT INTO ai_free_tier_daily_usage(model_id,usage_date,reserved_requests)
-- SELECT l.model_id,(now() AT TIME ZONE 'UTC')::date,1
-- FROM ai_free_tier_daily_limits l
-- JOIN ai_models m ON m.id=l.model_id
-- JOIN ai_providers p ON p.id=m.provider_id
-- WHERE l.model_id=$1 AND l.enabled=TRUE AND l.max_requests>=1
--   AND m.enabled=TRUE AND p.enabled=TRUE AND p.code='gemini'
-- ON CONFLICT(model_id,usage_date) DO UPDATE
-- SET reserved_requests=ai_free_tier_daily_usage.reserved_requests+1,
--     updated_at=now()
-- WHERE ai_free_tier_daily_usage.reserved_requests <
--   (SELECT max_requests FROM ai_free_tier_daily_limits
--    WHERE model_id=EXCLUDED.model_id AND enabled=TRUE)
-- RETURNING reserved_requests;
-- No returned row means the request must be rejected before calling Gemini.
-- Reservations are intentionally not refunded after ambiguous API failures.
-- Defaults are disabled to prevent accidental enabling of API calls.
