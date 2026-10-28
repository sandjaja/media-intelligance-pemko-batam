-- Email reset secrets are random, expire after 30 minutes and are stored only as hashes.
CREATE TABLE IF NOT EXISTS password_reset_email_tokens (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 password_fingerprint TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_email_tokens_user_idx ON password_reset_email_tokens(user_id,created_at DESC);
