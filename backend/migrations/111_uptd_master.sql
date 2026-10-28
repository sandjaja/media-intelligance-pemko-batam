-- Master UPTD / unit pelaksana teknis di bawah OPD.
-- Non-destructive: does not move or delete existing OPD data.

CREATE TABLE IF NOT EXISTS uptd (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  opd_id BIGINT NOT NULL REFERENCES opd(id) ON DELETE RESTRICT,
  code TEXT,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uptd_org_name
  ON uptd (organization_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS uq_uptd_org_code
  ON uptd (organization_id, upper(code))
  WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS idx_uptd_opd_active
  ON uptd (opd_id, active, name);

CREATE INDEX IF NOT EXISTS idx_uptd_org_active
  ON uptd (organization_id, active, name);
