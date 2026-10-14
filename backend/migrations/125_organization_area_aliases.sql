CREATE TABLE IF NOT EXISTS organization_area_aliases (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id,name)
);
CREATE INDEX IF NOT EXISTS idx_organization_area_aliases_active
  ON organization_area_aliases(organization_id,active,name);
