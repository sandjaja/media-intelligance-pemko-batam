-- Simplify OPD RBAC: merge opd_admin + opd_analyst into one OPD-scoped role.
-- Existing OPD scope is preserved. Legacy OPD users without an OPD scope are
-- downgraded to viewer so no account accidentally gains cross-OPD access.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';
ALTER TABLE roles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO roles(code,name,scope,active)
VALUES ('opd','OPD','opd',true)
ON CONFLICT (code) DO UPDATE
SET name=EXCLUDED.name,
    scope='opd',
    active=true;

-- Preserve the union of capabilities that existing OPD Admin/Analyst users had.
INSERT INTO role_permissions(role_id,permission_id)
SELECT target.id,rp.permission_id
FROM roles target
JOIN roles legacy ON legacy.code IN ('opd_admin','opd_analyst')
JOIN role_permissions rp ON rp.role_id=legacy.id
WHERE target.code='opd'
ON CONFLICT DO NOTHING;

-- Ensure the unified role has the baseline OPD capabilities even on databases
-- where one of the old role permission sets was incomplete.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'media.read','media.analyze','social.read','social.analyze','issues.read',
  'strategy.read','strategy.manage','content.read','content.manage',
  'reports.read','reports.export','opd.read','opd.manage_scoped'
)
WHERE r.code='opd'
ON CONFLICT DO NOTHING;

-- Migrate scoped OPD users to the unified role.
INSERT INTO user_roles(user_id,role_id,opd_id)
SELECT DISTINCT ur.user_id,target.id,COALESCE(ur.opd_id,u.opd_id)::bigint
FROM user_roles ur
JOIN roles legacy ON legacy.id=ur.role_id AND legacy.code IN ('opd_admin','opd_analyst')
JOIN roles target ON target.code='opd'
JOIN users u ON u.id=ur.user_id
WHERE COALESCE(ur.opd_id,u.opd_id) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Any malformed legacy OPD account without OPD scope becomes viewer rather than
-- silently receiving global access.
INSERT INTO user_roles(user_id,role_id,opd_id)
SELECT DISTINCT ur.user_id,target.id,NULL::bigint
FROM user_roles ur
JOIN roles legacy ON legacy.id=ur.role_id AND legacy.code IN ('opd_admin','opd_analyst')
JOIN roles target ON target.code='viewer'
JOIN users u ON u.id=ur.user_id
WHERE COALESCE(ur.opd_id,u.opd_id) IS NULL
ON CONFLICT DO NOTHING;

DELETE FROM user_roles ur
USING roles r
WHERE ur.role_id=r.id
  AND r.code IN ('opd_admin','opd_analyst');

UPDATE roles
SET active=false
WHERE code IN ('opd_admin','opd_analyst');
