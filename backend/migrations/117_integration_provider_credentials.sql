-- Provider integration configuration for portable multi-organization deployments.
-- Secrets must be encrypted by the application before they are stored in credential_ciphertext.
CREATE TABLE IF NOT EXISTS integration_providers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('api_key','oauth2','access_token','research_api','other')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_credentials (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  credential_ciphertext TEXT NOT NULL,
  credential_hint TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  last_test_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IN ('untested','healthy','error','expired','disabled')),
  last_error TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_id)
);

CREATE TABLE IF NOT EXISTS integration_settings (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id BIGINT NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_credentials_org_enabled
  ON integration_credentials(organization_id, enabled);

INSERT INTO integration_providers(code,name,auth_type)
VALUES
 ('youtube','YouTube Data API v3','api_key'),
 ('instagram','Instagram API','oauth2'),
 ('facebook','Facebook Graph API','oauth2'),
 ('threads','Threads API','oauth2'),
 ('tiktok','TikTok Research API','research_api'),
 ('x','X API','oauth2')
ON CONFLICT (code) DO NOTHING;
