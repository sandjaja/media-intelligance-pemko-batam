-- Foundation: official/owned social accounts for Pemko Batam and OPD
CREATE TABLE IF NOT EXISTS owned_social_accounts (
  id BIGSERIAL PRIMARY KEY,
  opd_id BIGINT REFERENCES opd(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','x','youtube','linkedin','threads')),
  account_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  account_type TEXT NOT NULL DEFAULT 'supporting' CHECK (account_type IN ('primary','supporting')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_owned_social_platform_handle
  ON owned_social_accounts(platform, lower(handle));
CREATE INDEX IF NOT EXISTS idx_owned_social_opd_active
  ON owned_social_accounts(opd_id, active, platform);
