import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

type AdminUser = { id: string; email: string; role: 'admin'|'operator'|'viewer'; opdId: string | null };

declare module 'fastify' { interface FastifyRequest { adminUser?: AdminUser } }

export async function registerAdminRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const adminAuth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const d = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof d.sub !== 'string' || d.role !== 'admin') throw new Error('forbidden');
      request.adminUser = { id: d.sub, email: String(d.email), role: 'admin', opdId: d.opdId ? String(d.opdId) : null };
    } catch {
      return reply.code(403).send({ error: 'ADMIN_REQUIRED' });
    }
  };

  const idParam = z.object({ id: z.string().regex(/^\d+$/) });
  const opdInput = z.object({ name: z.string().trim().min(2).max(200), code: z.string().trim().min(2).max(50), active: z.boolean().default(true) });
  const sourceInput = z.object({
    name: z.string().trim().min(2).max(200),
    category: z.enum(['online','print','social']),
    tier: z.coerce.number().int().min(1).max(3).default(2),
    url: z.string().trim().max(1000).optional().or(z.literal('')),
    active: z.boolean().default(true)
  });

  app.get('/api/admin/opd', { preHandler: adminAuth }, async () => {
    const { rows } = await pool.query(`SELECT id,code,name,active,created_at FROM opd ORDER BY active DESC,name ASC`);
    return { data: rows };
  });

  app.post('/api/admin/opd', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = opdInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_OPD', details: parsed.error.flatten() });
    try {
      const { rows } = await pool.query(`INSERT INTO opd(name,code,active) VALUES($1,$2,$3) RETURNING id,code,name,active,created_at`, [parsed.data.name, parsed.data.code.toUpperCase(), parsed.data.active]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OPD_CREATED',$2)`, [request.adminUser?.id, { opdId: rows[0].id, name: rows[0].name }]);
      return reply.code(201).send({ data: rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'OPD_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.patch('/api/admin/opd/:id', { preHandler: adminAuth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    const parsed = opdInput.partial().safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_OPD' });
    const current = (await pool.query(`SELECT id,code,name,active,created_at FROM opd WHERE id=$1`, [id.data.id])).rows[0];
    if (!current) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    const next = { name: parsed.data.name ?? current.name, code: (parsed.data.code ?? current.code).toUpperCase(), active: parsed.data.active ?? current.active };
    try {
      const { rows } = await pool.query(`UPDATE opd SET name=$1,code=$2,active=$3 WHERE id=$4 RETURNING id,code,name,active,created_at`, [next.name, next.code, next.active, id.data.id]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OPD_UPDATED',$2)`, [request.adminUser?.id, { opdId: id.data.id, changes: next }]);
      return { data: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'OPD_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.delete('/api/admin/opd/:id', { preHandler: adminAuth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_OPD' });
    const { rows } = await pool.query(`UPDATE opd SET active=false WHERE id=$1 RETURNING id,code,name,active`, [id.data.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'OPD_NOT_FOUND' });
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OPD_DEACTIVATED',$2)`, [request.adminUser?.id, { opdId: id.data.id }]);
    return { data: rows[0] };
  });

  app.get('/api/admin/sources', { preHandler: adminAuth }, async () => {
    const { rows } = await pool.query(`SELECT id,name,category,tier,url,active,created_at,last_checked_at,last_success_at,last_error,last_fetched_count,last_inserted_count FROM media_sources ORDER BY active DESC,tier ASC,name ASC`);
    return { data: rows };
  });

  app.post('/api/admin/sources', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = sourceInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_SOURCE', details: parsed.error.flatten() });
    try {
      const { rows } = await pool.query(`INSERT INTO media_sources(name,category,tier,url,active) VALUES($1,$2,$3,$4,$5) RETURNING id,name,category,tier,url,active,created_at`, [parsed.data.name, parsed.data.category, parsed.data.tier, parsed.data.url || null, parsed.data.active]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOURCE_CREATED',$2)`, [request.adminUser?.id, { sourceId: rows[0].id, name: rows[0].name }]);
      return reply.code(201).send({ data: rows[0] });
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'SOURCE_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.patch('/api/admin/sources/:id', { preHandler: adminAuth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    const parsed = sourceInput.partial().safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_SOURCE' });
    const current = (await pool.query(`SELECT id,name,category,tier,url,active FROM media_sources WHERE id=$1`, [id.data.id])).rows[0];
    if (!current) return reply.code(404).send({ error: 'SOURCE_NOT_FOUND' });
    const next = {
      name: parsed.data.name ?? current.name,
      category: parsed.data.category ?? current.category,
      tier: parsed.data.tier ?? current.tier,
      url: parsed.data.url === '' ? null : (parsed.data.url ?? current.url),
      active: parsed.data.active ?? current.active
    };
    try {
      const { rows } = await pool.query(`UPDATE media_sources SET name=$1,category=$2,tier=$3,url=$4,active=$5 WHERE id=$6 RETURNING id,name,category,tier,url,active,created_at`, [next.name, next.category, next.tier, next.url, next.active, id.data.id]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOURCE_UPDATED',$2)`, [request.adminUser?.id, { sourceId: id.data.id, changes: next }]);
      return { data: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'SOURCE_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.delete('/api/admin/sources/:id', { preHandler: adminAuth }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_SOURCE' });
    const { rows } = await pool.query(`UPDATE media_sources SET active=false WHERE id=$1 RETURNING id,name,category,tier,url,active`, [id.data.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'SOURCE_NOT_FOUND' });
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOURCE_DEACTIVATED',$2)`, [request.adminUser?.id, { sourceId: id.data.id }]);
    return { data: rows[0] };
  });
}
