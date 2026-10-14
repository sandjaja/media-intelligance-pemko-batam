-- Separate encrypted OAuth application identity from runtime access tokens.
ALTER TABLE integration_credentials
  ADD COLUMN IF NOT EXISTS app_id TEXT,
  ADD COLUMN IF NOT EXISTS app_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS app_secret_hint TEXT;
