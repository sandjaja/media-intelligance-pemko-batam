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


  const villageInput = z.object({
    name: z.string().trim().min(2).max(150),
    code: z.string().trim().max(50).optional().or(z.literal('')),
    active: z.boolean().default(true),
  });

  const getOrganizationId = async (ctx: AuthorizationContext) => {
    if (ctx.opdId) {
      const row = (await pool.query(`SELECT organization_id FROM opd WHERE id=$1`, [ctx.opdId])).rows[0];
      if (row?.organization_id) return Number(row.organization_id);
    }
    const rows = (await pool.query(`SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2`)).rows;
    if (rows.length !== 1) throw new Error('ACTIVE_ORGANIZATION_UNRESOLVED');
    return Number(rows[0].id);
  };

  app.get('/api/admin/districts', { preHandler: authz }, async (request) => {
    const organizationId = await getOrganizationId(request.districtAuthz!);
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
    const organizationId = await getOrganizationId(request.districtAuthz!);
    try {
      const { rows } = await pool.query(
        `INSERT INTO districts(organization_id,name,code,active)
         VALUES($1,$2,$3,$4)
         RETURNING id,organization_id,name,code,active,created_at`,
        [organizationId, parsed.data.name, parsed.data.code ? parsed.data.code.toUpperCase() : null, parsed.data.active],
      );
      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DISTRICT_CREATED',$2)`,
        [request.districtAuthz!.id, { organizationId, districtId: rows[0].id, name: rows[0].name, code: rows[0].code }],
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
    const organizationId = await getOrganizationId(request.districtAuthz!);
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
        [request.districtAuthz!.id, { organizationId, districtId: id.data.id, changes: next }],
      );
      return { data: rows[0] };
    } catch (error: any) {
      if (error?.code === '23505') return reply.code(409).send({ error: 'DISTRICT_ALREADY_EXISTS' });
      throw error;
    }
  });

  app.get('/api/admin/districts/:id/villages', { preHandler: authz }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_DISTRICT' });
    const organizationId = await getOrganizationId(request.districtAuthz!);
    const district = (await pool.query(`SELECT id FROM districts WHERE id=$1 AND organization_id=$2`, [id.data.id, organizationId])).rows[0];
    if (!district) return reply.code(404).send({ error: 'DISTRICT_NOT_FOUND' });
    const { rows } = await pool.query(
      `SELECT id,organization_id,district_id,name,code,active,created_at,updated_at
         FROM villages WHERE organization_id=$1 AND district_id=$2
        ORDER BY active DESC,name ASC`, [organizationId, id.data.id]);
    return { data: rows };
  });

  app.post('/api/admin/districts/:id/villages', { preHandler: authz }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    const parsed = villageInput.safeParse(request.body);
    if (!id.success || !parsed.success) return reply.code(400).send({ error: 'INVALID_VILLAGE' });
    const organizationId = await getOrganizationId(request.districtAuthz!);
    const district = (await pool.query(`SELECT id FROM districts WHERE id=$1 AND organization_id=$2 AND active=true`, [id.data.id, organizationId])).rows[0];
    if (!district) return reply.code(404).send({ error: 'DISTRICT_NOT_FOUND_OR_INACTIVE' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO villages(organization_id,district_id,name,code,active) VALUES($1,$2,$3,$4,$5)
         RETURNING id,organization_id,district_id,name,code,active,created_at,updated_at`,
        [organizationId,id.data.id,parsed.data.name,parsed.data.code?parsed.data.code.toUpperCase():null,parsed.data.active]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'VILLAGE_CREATED',$2)`,
        [request.districtAuthz!.id,{organizationId,districtId:id.data.id,villageId:rows[0].id,name:rows[0].name}]);
      return reply.code(201).send({data:rows[0]});
    } catch(error:any) {
      if(error?.code==='23505') return reply.code(409).send({error:'VILLAGE_ALREADY_EXISTS'});
      throw error;
    }
  });

  app.patch('/api/admin/districts/:districtId/villages/:id', { preHandler: authz }, async (request, reply) => {
    const params=z.object({districtId:z.string().regex(/^\d+$/),id:z.string().regex(/^\d+$/)}).safeParse(request.params);
    const parsed=villageInput.partial().safeParse(request.body);
    if(!params.success||!parsed.success)return reply.code(400).send({error:'INVALID_VILLAGE'});
    const organizationId=await getOrganizationId(request.districtAuthz!);
    const current=(await pool.query(`SELECT * FROM villages WHERE id=$1 AND district_id=$2 AND organization_id=$3`,
      [params.data.id,params.data.districtId,organizationId])).rows[0];
    if(!current)return reply.code(404).send({error:'VILLAGE_NOT_FOUND'});
    const next={name:parsed.data.name??current.name,code:parsed.data.code===''?null:(parsed.data.code?.toUpperCase()??current.code),active:parsed.data.active??current.active};
    try{
      const {rows}=await pool.query(`UPDATE villages SET name=$1,code=$2,active=$3,updated_at=NOW()
        WHERE id=$4 AND district_id=$5 AND organization_id=$6 RETURNING id,organization_id,district_id,name,code,active,created_at,updated_at`,
        [next.name,next.code,next.active,params.data.id,params.data.districtId,organizationId]);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'VILLAGE_UPDATED',$2)`,
        [request.districtAuthz!.id,{organizationId,districtId:params.data.districtId,villageId:params.data.id,changes:next}]);
      return{data:rows[0]};
    }catch(error:any){if(error?.code==='23505')return reply.code(409).send({error:'VILLAGE_ALREADY_EXISTS'});throw error;}
  });

  app.delete('/api/admin/districts/:districtId/villages/:id', { preHandler: authz }, async (request, reply) => {
    const params=z.object({districtId:z.string().regex(/^\d+$/),id:z.string().regex(/^\d+$/)}).safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:'INVALID_VILLAGE'});
    const organizationId=await getOrganizationId(request.districtAuthz!);
    const {rows}=await pool.query(`UPDATE villages SET active=false,updated_at=NOW()
      WHERE id=$1 AND district_id=$2 AND organization_id=$3 RETURNING id,name,active`,
      [params.data.id,params.data.districtId,organizationId]);
    if(!rows[0])return reply.code(404).send({error:'VILLAGE_NOT_FOUND'});
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'VILLAGE_DEACTIVATED',$2)`,
      [request.districtAuthz!.id,{organizationId,districtId:params.data.districtId,villageId:params.data.id}]);
    return{data:rows[0]};
  });

  app.delete('/api/admin/districts/:id', { preHandler: authz }, async (request, reply) => {
    const id = idParam.safeParse(request.params);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_DISTRICT' });
    const organizationId = await getOrganizationId(request.districtAuthz!);
    const { rows } = await pool.query(
      `UPDATE districts SET active=false
        WHERE id=$1 AND organization_id=$2
        RETURNING id,organization_id,name,code,active,created_at`,
      [id.data.id, organizationId],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'DISTRICT_NOT_FOUND' });
    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DISTRICT_DEACTIVATED',$2)`,
      [request.districtAuthz!.id, { organizationId, districtId: id.data.id }],
    );
    return { data: rows[0] };
  });
}
