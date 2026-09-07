import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' {
  interface FastifyRequest {
    districtAuthz?: AuthorizationContext;
  }
}

export async function registerDistrictRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const authz = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const context = await loadAuthorizationContext(pool, decoded.sub);
      if (!context || !context.active) return reply.code(401).send({ error: 'USER_INACTIVE_OR_MISSING' });
      if (!context.roles.includes('super_admin') && !hasPermission(context, 'platform.admin') && !hasPermission(context, 'opd.manage')) {
        return reply.code(403).send({ error: 'FORBIDDEN' });
      }
      request.districtAuthz = context;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const idParam = z.object({ id: z.string().regex(/^\d+$/) });
  const districtInput = z.object({
    name: z.string().trim().min(2).max(150),
    code: z.string().trim().max(50).optional().or(z.literal('')),
    active: z.boolean().default(true),
  });

  const getOrganizationId = async () => {
    const row = (await pool.query(`SELECT id FROM organizations WHERE code='PEMKO_BATAM' AND active=true ORDER BY id LIMIT 1`)).rows[0];
    if (!row) throw new Error('PEMKO_BATAM_ORGANIZATION_NOT_FOUND');
    return row.id;
  };

  app.get('/api/admin/districts', { preHandler: authz }, async () => {
    const organizationId = await getOrganizationId();
    const { rows } = await pool.query(
      `SELECT id,organization_id,name,code,active,created_at
         FROM districts
        WHERE organization_id=$1
        ORDER BY active DESC,name ASC`,
      [organizationId],
    );
    return { data: rows };
  });

  app.post('/api/admin/districts', { preHandler: authz }, async (request, reply) => {
    const parsed = districtInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_DISTRICT', details: parsed.error.flatten() });
    const organizationId = await getOrganizationId();
    try {
      const { rows } = await pool.query(
        `INSERT INTO districts(organization_id,name,code,active)
         VALUES($1,$2,$3,$4)
         RETURNING id,organization_id,name,code,active,created_at`,
        [organizationId, parsed.data.name, parsed.data.code ? parsed.data.code.toUpperCase() : null, parsed.data.active],
      );
      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DISTRICT_CREATED',$2)`,
        [request.districtAuthz!.id, { districtId: rows[0].id, name: rows[0].name, code: rows[0].code }],
      );
      return reply.code(201).send({ data: rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'DISTRICT_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.patch('/api/admin/districts/:id', { preHandler: authz }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    const parsed = districtInput.partial().safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_DISTRICT' });
    const organizationId = await getOrganizationId();
    const current = (await pool.query(
      `SELECT id,name,code,active FROM districts WHERE id=$1 AND organization_id=$2`,
      [id.data.id, organizationId],
    )).rows[0];
    if (!current) return reply.code(404).send({ error: 'DISTRICT_NOT_FOUND' });
    const next = {
      name: parsed.data.name ?? current.name,
      code: parsed.data.code === '' ? null : (parsed.data.code?.toUpperCase() ?? current.code),
      active: parsed.data.active ?? current.active,
    };
    try {
      const { rows } = await pool.query(
        `UPDATE districts SET name=$1,code=$2,active=$3
          WHERE id=$4 AND organization_id=$5
          RETURNING id,organization_id,name,code,active,created_at`,
        [next.name, next.code, next.active, id.data.id, organizationId],
      );
      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DISTRICT_UPDATED',$2)`,
        [request.districtAuthz!.id, { districtId: id.data.id, changes: next }],
      );
      return { data: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'DISTRICT_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.delete('/api/admin/districts/:id', { preHandler: authz }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_DISTRICT' });
    const organizationId = await getOrganizationId();
    const { rows } = await pool.query(
      `UPDATE districts SET active=false
        WHERE id=$1 AND organization_id=$2
        RETURNING id,organization_id,name,code,active,created_at`,
      [id.data.id, organizationId],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'DISTRICT_NOT_FOUND' });
    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DISTRICT_DEACTIVATED',$2)`,
      [request.districtAuthz!.id, { districtId: id.data.id }],
    );
    return { data: rows[0] };
  });
}
