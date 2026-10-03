-- Hierarchical village/kelurahan reference data under districts.
-- Geographic evidence only: villages do not imply OPD, keyword, taxonomy, or issue ownership.

-- A legacy `villages` table may already exist in older deployments.
-- Normalize it in-place before creating indexes so the migration is safe for both fresh and existing databases.
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


ALTER TABLE villages ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES districts(id) ON DELETE CASCADE;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE villages ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE villages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Derive tenant ownership from the parent district for legacy rows whenever possible.
UPDATE villages v
SET organization_id = d.organization_id
FROM districts d
WHERE v.district_id = d.id
  AND v.organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_villages_district_name
  ON villages(district_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_villages_active_org_district
  ON villages(organization_id, district_id, active);
