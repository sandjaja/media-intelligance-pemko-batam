import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { ingestSource } from './ingestion.js';
import { loadAuthorizationContext, hasPermission, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { onlineMediaAuth?: AuthorizationContext } }

export async function registerOnlineMediaRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const decoded=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof decoded.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,decoded.sub);
      if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
      request.onlineMediaAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const canOperate=(ctx:AuthorizationContext)=>hasPermission(ctx,'platform.admin')||hasPermission(ctx,'media.source.manage')||ctx.roles.includes('humas');

  app.get('/api/online-media/sources',{preHandler:auth},async()=>{
    const {rows}=await pool.query(`SELECT id,name,category,tier,url,active,last_checked_at,last_success_at,last_error,last_fetched_count,last_inserted_count FROM media_sources WHERE category='online' ORDER BY tier ASC,name ASC`);
    return{data:rows};
  });

  app.get('/api/online-media/articles',{preHandler:auth},async(request,reply)=>{
    const parsed=z.object({sourceId:z.coerce.number().int().positive().optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const params:unknown[]=[];const where=[`ms.category='online'`];
    if(parsed.data.sourceId){params.push(parsed.data.sourceId);where.push(`a.source_id=$${params.length}`)}
    params.push(parsed.data.limit);
    const {rows}=await pool.query(`SELECT a.id,a.source_id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.risk_level,a.summary,ms.name source_name FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE ${where.join(' AND ')} ORDER BY a.published_at DESC NULLS LAST,a.id DESC LIMIT $${params.length}`,params);
    return{data:rows};
  });

  app.post('/api/online-media/sources/:id/test',{preHandler:auth},async(request,reply)=>{
    if(!canOperate(request.onlineMediaAuth!))return reply.code(403).send({error:'FORBIDDEN'});
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);
    if(!id.success)return reply.code(400).send({error:'INVALID_SOURCE_ID'});
    const {rows}=await pool.query(`SELECT id,name,url,tier,active FROM media_sources WHERE id=$1 AND category='online' LIMIT 1`,[id.data]);
    const source=rows[0];if(!source)return reply.code(404).send({error:'ONLINE_SOURCE_NOT_FOUND'});
    if(!source.active)return reply.code(409).send({error:'ONLINE_SOURCE_INACTIVE'});
    if(!source.url)return reply.code(409).send({error:'ONLINE_SOURCE_URL_MISSING'});
    try{
      const result=await ingestSource(pool,source);
      return{ok:true,source:{id:source.id,name:source.name},result};
    }catch(error){
      return reply.code(502).send({error:'ONLINE_SOURCE_TEST_FAILED',message:error instanceof Error?error.message:String(error),source:{id:source.id,name:source.name}});
    }
  });
}
