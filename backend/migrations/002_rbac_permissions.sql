-- Foundation RBAC permissions for Batam Media & Communication Command Center

INSERT INTO permissions(code, name) VALUES
  ('platform.admin','Full platform administration'),
  ('users.manage','Create, update and deactivate users'),
  ('rbac.manage','Manage roles and permissions'),
  ('opd.manage','Manage OPD master data'),
  ('sources.manage','Manage media and ingestion sources'),
  ('keywords.manage','Manage monitoring keywords'),
  ('media.read','Read media intelligence'),
  ('media.analyze','Analyze media intelligence'),
  ('social.read','Read social intelligence'),
  ('social.analyze','Analyze social intelligence'),
  ('issues.read','Read issue and narrative intelligence'),
  ('issues.manage','Manage issue intelligence'),
  ('strategy.read','Read communication strategies'),
  ('strategy.manage','Create and manage communication strategies'),
  ('content.read','Read AI content packages'),
  ('content.manage','Create and manage AI content packages'),
  ('crisis.read','Read crisis war room data'),
  ('crisis.manage','Manage crisis war room actions'),
  ('reports.read','Read reports'),
  ('reports.export','Export reports'),
  ('executive.read','Read executive command center'),
  ('opd.read','Read OPD-scoped intelligence'),
  ('opd.manage_scoped','Manage OPD-scoped configuration')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='super_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','media.analyze','social.read','social.analyze','issues.read','issues.manage',
  'strategy.read','strategy.manage','content.read','content.manage','crisis.read','crisis.manage',
  'reports.read','reports.export','executive.read','opd.read'
) WHERE r.code='command_center_analyst'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','social.read','issues.read','strategy.read','strategy.manage',
  'content.read','content.manage','crisis.read','crisis.manage','reports.read','reports.export','opd.read'
) WHERE r.code='humas'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','social.read','issues.read','strategy.read','crisis.read','reports.read','executive.read','opd.read'
) WHERE r.code='executive'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','social.read','issues.read','strategy.read','strategy.manage','content.read','content.manage',
  'reports.read','reports.export','opd.read','opd.manage_scoped'
) WHERE r.code='opd_admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','media.analyze','social.read','social.analyze','issues.read','strategy.read',
  'content.read','reports.read','reports.export','opd.read'
) WHERE r.code='opd_analyst'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
  'media.read','social.read','issues.read','strategy.read','reports.read','opd.read'
) WHERE r.code='viewer'
ON CONFLICT DO NOTHING;
