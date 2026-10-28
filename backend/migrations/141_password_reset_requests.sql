-- Password reset request queue for internal accounts.
-- Approved schema change: workflow state only; no plaintext passwords or reset tokens.
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','CANCELLED')),
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT password_reset_requests_resolution_chk CHECK ((status='PENDING' AND resolved_at IS NULL) OR (status IN ('COMPLETED','CANCELLED') AND resolved_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_requests_pending_user ON password_reset_requests(user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_requested ON password_reset_requests(status, requested_at DESC);
