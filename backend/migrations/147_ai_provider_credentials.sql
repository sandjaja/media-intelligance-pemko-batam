CREATE TABLE IF NOT EXISTS ai_provider_credentials (
 provider_id BIGINT PRIMARY KEY REFERENCES ai_providers(id) ON DELETE CASCADE,
 credential_ciphertext TEXT NOT NULL,
 credential_hint TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
