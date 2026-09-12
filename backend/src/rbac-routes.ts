import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { z } from 'zod';
import { NORMALIZED_ROLES, hasPermission, legacyRoleFor, loadAuthorizationContext, roleRequiresOpd, type AuthorizationContext, type NormalizedRole } from './rbac.js';

declare module 'fastify' {
  interface FastifyRequest {
    authz?: AuthorizationContext;
  }
}

const roleEnum = z.enum(NORMALIZED_ROLES);
const ROLE_DESCRIPTIONS: Record<string,string> = {
  super_admin: 'Akses penuh platform, konfigurasi, pengguna dan seluruh data Command Center.',
  humas: 'Operasional komunikasi, analisis media, konten, strategi, assignment OPD, review dan approval respons.',
  executive: 'Akses baca executive intelligence, isu strategis, strategi dan laporan.',
  opd: 'Menerima tugas OPD, menyiapkan fakta/data, menyusun respons, dan mengirimkannya ke Humas untuk review/approval.',
  viewer: 'Akses baca terbatas untuk monitoring dan laporan.',
};

export async function registerRbacRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const authz = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const context = await loadAuthorizationContext(pool, decoded.sub);
      if (!context || !context.active) return reply.code(401).send({ error: 'USER_INACTIVE_OR_MISSING' });
      request.authz = context;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const requirePermission = (permission: string) => async (request: FastifyRequest, reply: any) => {
    if (!request.authz || !hasPermission(request.authz, permission)) return reply.code(403).send({ error: 'FORBIDDEN', permission });
  };

  app.get('/api/rbac/me', { preHandler: authz }, async request => ({
    user: {
      id: request.authz!.id,
      email: request.authz!.email,
      role: request.authz!.legacyRole,
      opdId: request.authz!.opdId,
      roles: request.authz!.roles,
      permissions: request.authz!.permissions,
    },
  }));

  app.get('/api/admin/rbac/roles', { preHandler: [authz, requirePermission('users.manage')] }, async () => {
    const { rows } = await pool.query(
      `SELECT r.id,r.code,r.name,r.scope,r.active,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), ARRAY[]::text[]) permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id=r.id
         LEFT JOIN permissions p ON p.id=rp.permission_id
        WHERE r.active=true
          AND r.code IN ('super_admin','humas','executive','opd','viewer')
        GROUP BY r.id,r.code,r.name,r.scope,r.active
        ORDER BY CASE r.code
          WHEN 'super_admin' THEN 1 WHEN 'humas' THEN 2 WHEN 'executive' THEN 3
          WHEN 'opd' THEN 4 ELSE 5 END`,
    );
    return { data: rows.map(row => ({ ...row, description: ROLE_DESCRIPTIONS[row.code] ?? '' })) };
  });

  app.get('/api/admin/rbac/users', { preHandler: [authz, requirePermission('users.manage')] }, async () => {
    const { rows } = await pool.query(
      `SELECT u.id,u.email,u.role legacy_role,u.active,u.opd_id,o.name opd_name,u.created_at,
              COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) roles
         FROM users u
         LEFT JOIN opd o ON o.id=u.opd_id
         LEFT JOIN user_roles ur ON ur.user_id=u.id
         LEFT JOIN roles r ON r.id=ur.role_id
        GROUP BY u.id,u.email,u.role,u.active,u.opd_id,o.name,u.created_at
        ORDER BY u.email`,
    );
    return { data: rows };
  });

  const createInput = z.object({
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
    role: roleEnum,
    opdId: z.coerce.number().int().positive().nullable().optional(),
    active: z.boolean().default(true),
  });

  app.post('/api/admin/rbac/users', { preHandler: [authz, requirePermission('users.manage')] }, async (request, reply) => {
    const parsed = createInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_USER', details: parsed.error.flatten() });
    const role = parsed.data.role as NormalizedRole;
    const opdId = parsed.data.opdId ?? null;
    if (roleRequiresOpd(role) && !opdId) return reply.code(400).send({ error: 'OPD_REQUIRED_FOR_ROLE' });
    if (!roleRequiresOpd(role) && opdId) return reply.code(400).send({ error: 'GLOBAL_ROLE_CANNOT_HAVE_OPD_SCOPE' });
    if (opdId && !(await pool.query(`SELECT id FROM opd WHERE id=$1 AND active=true`, [opdId])).rows[0]) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO users(email,password_hash,role,active,opd_id)
         VALUES($1,$2,$3,$4,$5)
         RETURNING id,email,role,active,opd_id,created_at`,
        [parsed.data.email.toLowerCase(), passwordHash, legacyRoleFor(role), parsed.data.active, opdId],
      );
      await client.query(
        `INSERT INTO user_roles(user_id,role_id,opd_id)
         SELECT $1,r.id,$2 FROM roles r WHERE r.code=$3
         ON CONFLICT DO NOTHING`,
        [rows[0].id, opdId, role],
      );
      await client.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'RBAC_USER_CREATED',$2)`,
        [request.authz!.id, { userId: rows[0].id, email: rows[0].email, normalizedRole: role, opdId }],
      );
      await client.query('COMMIT');
      return reply.code(201).send({ data: { ...rows[0], roles: [role] } });
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') return reply.code(409).send({ error: 'USER_ALREADY_EXISTS' });
      throw error;
    } finally {
      client.release();
    }
  });

  const updateInput = z.object({
    email: z.string().email().max(200).optional(),
    password: z.string().min(8).max(200).optional(),
    role: roleEnum.optional(),
    opdId: z.coerce.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
  });

  app.patch('/api/admin/rbac/users/:id', { preHandler: [authz, requirePermission('users.manage')] }, async (request, reply) => {
    const id = z.object({ id: z.string().regex(/^\d+$/) }).safeParse(request.params);
    const parsed = updateInput.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_USER' });
    const current = (await pool.query(
      `SELECT u.*,COALESCE((SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id ORDER BY CASE WHEN r.code='super_admin' THEN 0 ELSE 1 END LIMIT 1),'viewer') normalized_role
       FROM users u WHERE u.id=$1`,
      [id.data.id],
    )).rows[0];
    if (!current) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const role = (parsed.data.role ?? current.normalized_role) as NormalizedRole;
    const opdId = parsed.data.opdId === undefined ? (current.opd_id ?? null) : parsed.data.opdId;
    if (roleRequiresOpd(role) && !opdId) return reply.code(400).send({ error: 'OPD_REQUIRED_FOR_ROLE' });
    if (!roleRequiresOpd(role) && opdId) return reply.code(400).send({ error: 'GLOBAL_ROLE_CANNOT_HAVE_OPD_SCOPE' });
    if (String(id.data.id) === request.authz!.id) {
      if (parsed.data.active === false) return reply.code(400).send({ error: 'CANNOT_DISABLE_SELF' });
      if (request.authz!.roles.includes('super_admin') && role !== 'super_admin') return reply.code(400).send({ error: 'CANNOT_REMOVE_OWN_SUPER_ADMIN' });
    }
    if (opdId && !(await pool.query(`SELECT id FROM opd WHERE id=$1 AND active=true`, [opdId])).rows[0]) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const passwordHash = parsed.data.password ? await argon2.hash(parsed.data.password, { type: argon2.argon2id }) : current.password_hash;
      const { rows } = await client.query(
        `UPDATE users SET email=$1,password_hash=$2,role=$3,active=$4,opd_id=$5 WHERE id=$6
         RETURNING id,email,role,active,opd_id,created_at`,
        [parsed.data.email?.toLowerCase() ?? current.email, passwordHash, legacyRoleFor(role), parsed.data.active ?? current.active, opdId, id.data.id],
      );
      await client.query(`DELETE FROM user_roles WHERE user_id=$1`, [id.data.id]);
      await client.query(
        `INSERT INTO user_roles(user_id,role_id,opd_id)
         SELECT $1,r.id,$2 FROM roles r WHERE r.code=$3`,
        [id.data.id, opdId, role],
      );
      await client.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'RBAC_USER_UPDATED',$2)`,
        [request.authz!.id, { userId: id.data.id, normalizedRole: role, opdId, active: parsed.data.active ?? current.active }],
      );
      await client.query('COMMIT');
      return { data: { ...rows[0], roles: [role] } };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error?.code === '23505') return reply.code(409).send({ error: 'USER_ALREADY_EXISTS' });
      throw error;
    } finally {
      client.release();
    }
  });
}
