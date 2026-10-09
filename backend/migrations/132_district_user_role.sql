-- District-scoped user role foundation.
-- Additive only. Existing OPD/global user scopes remain unchanged.
-- Apply to a database only after explicit approval.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES districts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_district
  ON users(district_id)
  WHERE district_id IS NOT NULL;

-- The current roles.scope constraint predates district-scoped accounts.
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_scope_check;
ALTER TABLE roles
  ADD CONSTRAINT roles_scope_check
  CHECK (scope IN ('system','organization','opd','district'));

INSERT INTO roles(code,name,scope,active)
VALUES ('district','Kecamatan','district',true)
ON CONFLICT (code) DO UPDATE
SET name=EXCLUDED.name,
    scope='district',
    active=true;

-- Kecamatan can monitor issue/media context and reports. Contribution write access
-- is enforced by Phase 3 assignment routes rather than granting global issue management.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.code IN ('media.read','social.read','issues.read','reports.read')
WHERE r.code='district'
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN users.district_id IS
  'District scope for users with normalized role district. Null for global and OPD-scoped users.';
