import type { Pool } from 'pg';

export const NORMALIZED_ROLES = [
  'super_admin',
  'command_center_analyst',
  'humas',
  'executive',
  'opd_admin',
  'opd_analyst',
  'viewer',
] as const;

export type NormalizedRole = typeof NORMALIZED_ROLES[number];
export type LegacyRole = 'admin' | 'operator' | 'viewer';

export type AuthorizationContext = {
  id: string;
  email: string;
  legacyRole: LegacyRole;
  opdId: string | null;
  active: boolean;
  roles: NormalizedRole[];
  permissions: string[];
};

export function legacyRoleFor(role: NormalizedRole): LegacyRole {
  if (role === 'super_admin') return 'admin';
  if (role === 'executive' || role === 'viewer') return 'viewer';
  return 'operator';
}

export function roleRequiresOpd(role: NormalizedRole) {
  return role === 'opd_admin' || role === 'opd_analyst';
}

export async function loadAuthorizationContext(pool: Pool, userId: string): Promise<AuthorizationContext | null> {
  const { rows } = await pool.query(
    `SELECT u.id,u.email,u.role,u.opd_id,u.active,
            COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) roles,
            COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), ARRAY[]::text[]) permissions
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN roles r ON r.id=ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id=r.id
       LEFT JOIN permissions p ON p.id=rp.permission_id
      WHERE u.id=$1
      GROUP BY u.id,u.email,u.role,u.opd_id,u.active
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    legacyRole: row.role as LegacyRole,
    opdId: row.opd_id == null ? null : String(row.opd_id),
    active: Boolean(row.active),
    roles: (row.roles || []).filter((x: string) => (NORMALIZED_ROLES as readonly string[]).includes(x)) as NormalizedRole[],
    permissions: (row.permissions || []).map(String),
  };
}

export function hasPermission(context: AuthorizationContext, permission: string) {
  if (context.roles.includes('super_admin')) return true;
  // Humas is the operational role for the print-media workflow: upload, review,
  // correct metadata/OCR, verify, and advance clipping status for intelligence processing.
  if (context.roles.includes('humas') && permission === 'intelligence.write') return true;
  return context.permissions.includes(permission);
}
