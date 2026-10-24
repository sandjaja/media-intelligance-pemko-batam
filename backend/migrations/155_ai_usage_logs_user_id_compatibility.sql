-- Draft only: apply to approved Neon Preview after review.
-- Existing AI admin usage routes and budget ledger insert user_id, while
-- migration 145 originally created ai_usage_logs without that column.
ALTER TABLE ai_usage_logs
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON ai_usage_logs(user_id,created_at DESC);
