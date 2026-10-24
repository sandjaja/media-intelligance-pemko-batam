-- Simplify RBAC to five active roles by merging Command Center Analyst into Humas.
-- Existing users keep access through Humas and the legacy role is deactivated.

INSERT INTO user_roles(user_id, role_id, opd_id)
SELECT DISTINCT ur.user_id, humas.id, NULL::bigint
FROM user_roles ur
JOIN roles legacy ON legacy.id=ur.role_id AND legacy.code='command_center_analyst'
JOIN roles humas ON humas.code='humas'
ON CONFLICT DO NOTHING;

DELETE FROM user_roles ur
USING roles r
WHERE ur.role_id=r.id
  AND r.code='command_center_analyst';

UPDATE users u
SET role='operator', opd_id=NULL
WHERE EXISTS (
  SELECT 1
  FROM user_roles ur
  JOIN roles r ON r.id=ur.role_id
  WHERE ur.user_id=u.id AND r.code='humas'
)
AND u.email='command@pemko.go.id';

UPDATE roles
SET active=false
WHERE code='command_center_analyst';
