-- Normalize a legacy villages table used by older deployments.
-- This migration is intentionally additive and idempotent.
ALTER TABLE villages ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES districts(id) ON DELETE CASCADE;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE villages ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE villages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE villages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE villages v
SET organization_id = d.organization_id
FROM districts d
WHERE v.district_id = d.id
  AND v.organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_villages_district_name
  ON villages(district_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_villages_active_org_district
  ON villages(organization_id, district_id, active);