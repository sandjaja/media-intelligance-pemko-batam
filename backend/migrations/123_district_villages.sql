-- Hierarchical village/kelurahan reference data under districts.
-- Geographic evidence only: villages do not imply OPD, keyword, taxonomy, or issue ownership.

CREATE TABLE IF NOT EXISTS villages (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  district_id BIGINT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_villages_district_name
  ON villages(district_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_villages_active_org_district
  ON villages(organization_id, district_id, active);
