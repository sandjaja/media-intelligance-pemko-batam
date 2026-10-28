-- PREVIEW ONLY. Do not apply to Production without explicit approval.
-- One audit record per successfully reserved Gemini request; no prompts or credentials.
CREATE TABLE IF NOT EXISTS ai_gemini_quota_feature_audit (
  id BIGSERIAL PRIMARY KEY,
  model_id BIGINT NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  feature_code TEXT NOT NULL CHECK (length(feature_code) BETWEEN 1 AND 80),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_gemini_quota_feature_audit_day
  ON ai_gemini_quota_feature_audit(usage_date,model_id,feature_code);
