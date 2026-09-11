import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

export async function registerOwnedSocialRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const d = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof d.sub !== 'string') throw new Error('invalid_subject');
      const { rows } = await pool.query(
        `SELECT u.id,u.active,
                COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) roles,
                COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), ARRAY[]::text[]) permissions
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id=u.id
         LEFT JOIN roles r ON r.id=ur.role_id
         LEFT JOIN role_permissions rp ON rp.role_id=r.id
         LEFT JOIN permissions p ON p.id=rp.permission_id
         WHERE u.id=$1
         GROUP BY u.id,u.active`,
        [d.sub],
      );
      const user = rows[0];
      const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
      const permissions = Array.isArray(user?.permissions) ? user.permissions.map(String) : [];
      if (user?.active !== true || (!roles.includes('super_admin') && !permissions.includes('platform.admin') && !permissions.includes('sources.manage'))) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }
      (request as any).ownedSocialAdminUserId = String(user.id);
    } catch {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };

  const idParam = z.object({ id: z.string().regex(/^\d+$/) });
  const accountInput = z.object({
    opdId: z.coerce.number().int().positive().nullable().optional(),
    platform: z.enum(['instagram','facebook','tiktok','x','youtube','website','threads']),
    accountName: z.string().trim().min(2).max(200),
    handle: z.string().trim().min(1).max(200),
    profileUrl: z.string().trim().url().max(1000).optional().or(z.literal('')),
    accountType: z.enum(['primary','supporting']).default('supporting'),
    active: z.boolean().default(true),
    isPrimarySource: z.boolean().default(false),
  }).superRefine((data, ctx) => {
    if (data.platform === 'website' && !data.profileUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileUrl'], message: 'Website resmi wajib memiliki URL.' });
    }
    if (data.opdId && data.isPrimarySource) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['isPrimarySource'], message: 'Sumber utama Pemko hanya dapat digunakan oleh kanal Pemko/lintas OPD.' });
    }
  });

  app.get('/api/admin/owned-social-accounts', { preHandler: auth }, async () => {
    const { rows } = await pool.query(
      `SELECT a.id,a.opd_id,a.platform,a.account_name,a.handle,a.profile_url,a.account_type,a.active,
              a.ownership_level,a.is_primary_source,a.source_priority,a.created_at,a.updated_at,
              o.name AS opd_name,o.code AS opd_code
       FROM owned_social_accounts a
       LEFT JOIN opd o ON o.id=a.opd_id
       ORDER BY a.active DESC,a.platform ASC,a.account_name ASC`,
    );
    return { data: rows };
  });

  app.post('/api/admin/owned-social-accounts', { preHandler: auth }, async (request, reply) => {
    const parsed = accountInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_OWNED_SOCIAL_ACCOUNT', details: parsed.error.flatten() });
    if (parsed.data.opdId && !(await pool.query(`SELECT id FROM opd WHERE id=$1`, [parsed.data.opdId])).rows[0]) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    const ownershipLevel = parsed.data.opdId ? 'opd' : 'pemko';
    const isPrimarySource = ownershipLevel === 'pemko' && parsed.data.isPrimarySource;
    const sourcePriority = ownershipLevel === 'pemko' ? 100 : 10;
    try {
      const { rows } = await pool.query(
        `INSERT INTO owned_social_accounts(opd_id,platform,account_name,handle,profile_url,account_type,active,ownership_level,is_primary_source,source_priority)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id,opd_id,platform,account_name,handle,profile_url,account_type,active,ownership_level,is_primary_source,source_priority,created_at,updated_at`,
        [parsed.data.opdId ?? null, parsed.data.platform, parsed.data.accountName, parsed.data.handle, parsed.data.profileUrl || null, parsed.data.accountType, parsed.data.active, ownershipLevel, isPrimarySource, sourcePriority],
      );
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_SOCIAL_ACCOUNT_CREATED',$2)`, [(request as any).ownedSocialAdminUserId, { accountId: rows[0].id, platform: rows[0].platform, handle: rows[0].handle, ownershipLevel, isPrimarySource }]);
      return reply.code(201).send({ data: rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'OWNED_SOCIAL_ACCOUNT_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.patch('/api/admin/owned-social-accounts/:id', { preHandler: auth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    const parsed = accountInput.partial().safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_OWNED_SOCIAL_ACCOUNT' });
    const current = (await pool.query(`SELECT * FROM owned_social_accounts WHERE id=$1`, [id.data.id])).rows[0];
    if (!current) return reply.code(404).send({ error: 'OWNED_SOCIAL_ACCOUNT_NOT_FOUND' });
    const next = {
      opdId: parsed.data.opdId === undefined ? current.opd_id : parsed.data.opdId,
      platform: parsed.data.platform ?? current.platform,
      accountName: parsed.data.accountName ?? current.account_name,
      handle: parsed.data.handle ?? current.handle,
      profileUrl: parsed.data.profileUrl === '' ? null : (parsed.data.profileUrl ?? current.profile_url),
      accountType: parsed.data.accountType ?? current.account_type,
      active: parsed.data.active ?? current.active,
      isPrimarySource: parsed.data.isPrimarySource ?? current.is_primary_source,
    };
    if (next.platform === 'website' && !next.profileUrl) return reply.code(400).send({ error: 'WEBSITE_URL_REQUIRED' });
    if (next.opdId && !(await pool.query(`SELECT id FROM opd WHERE id=$1`, [next.opdId])).rows[0]) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    const ownershipLevel = next.opdId ? 'opd' : 'pemko';
    if (ownershipLevel === 'opd') next.isPrimarySource = false;
    const sourcePriority = ownershipLevel === 'pemko' ? 100 : 10;
    try {
      const { rows } = await pool.query(
        `UPDATE owned_social_accounts
         SET opd_id=$1,platform=$2,account_name=$3,handle=$4,profile_url=$5,account_type=$6,active=$7,
             ownership_level=$8,is_primary_source=$9,source_priority=$10,updated_at=now()
         WHERE id=$11
         RETURNING id,opd_id,platform,account_name,handle,profile_url,account_type,active,ownership_level,is_primary_source,source_priority,created_at,updated_at`,
        [next.opdId, next.platform, next.accountName, next.handle, next.profileUrl, next.accountType, next.active, ownershipLevel, next.isPrimarySource, sourcePriority, id.data.id],
      );
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_SOCIAL_ACCOUNT_UPDATED',$2)`, [(request as any).ownedSocialAdminUserId, { accountId: id.data.id, ownershipLevel, isPrimarySource: next.isPrimarySource }]);
      return { data: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'OWNED_SOCIAL_ACCOUNT_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.delete('/api/admin/owned-social-accounts/:id', { preHandler: auth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_OWNED_SOCIAL_ACCOUNT' });
    const { rows } = await pool.query(`UPDATE owned_social_accounts SET active=false,updated_at=now() WHERE id=$1 RETURNING id,active`, [id.data.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'OWNED_SOCIAL_ACCOUNT_NOT_FOUND' });
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_SOCIAL_ACCOUNT_DEACTIVATED',$2)`, [(request as any).ownedSocialAdminUserId, { accountId: id.data.id }]);
    return { data: rows[0] };
  });
}
