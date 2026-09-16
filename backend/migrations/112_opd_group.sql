BEGIN;

ALTER TABLE opd
  ADD COLUMN IF NOT EXISTS opd_group TEXT;

ALTER TABLE opd DROP CONSTRAINT IF EXISTS opd_group_check;
ALTER TABLE opd ADD CONSTRAINT opd_group_check
  CHECK (opd_group IS NULL OR opd_group IN ('DINAS','BADAN','SETDA','LAINNYA'));

UPDATE opd
SET opd_group = CASE
  WHEN lower(name) LIKE 'dinas %' THEN 'DINAS'
  WHEN lower(name) LIKE 'badan %' THEN 'BADAN'
  WHEN lower(name) LIKE 'bagian %' OR lower(name) LIKE '%sekretariat daerah%' THEN 'SETDA'
  ELSE 'LAINNYA'
END
WHERE opd_group IS NULL;

ALTER TABLE opd ALTER COLUMN opd_group SET DEFAULT 'LAINNYA';
ALTER TABLE opd ALTER COLUMN opd_group SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opd_organization_group_active
  ON opd(organization_id, opd_group, active);

COMMIT;
