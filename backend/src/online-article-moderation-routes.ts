import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { onlineModerationAuth?: AuthorizationContext } }
const canModerate=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
async function organizationId(pool:Pool,ctx:AuthorizationContext){
  if(ctx.opdId){const r=await pool.query(`SELECT organization_id FROM opd WHERE id=$1`,[ctx.opdId]);if(r.rows[0]?.organization_id)return Number(r.rows[0].organization_id);}
  const r=await pool.query(`SELECT id FROM organizations ORDER BY id LIMIT 2`);return r.rowCount===1?Number(r.rows[0].id):0;
}

export async function registerOnlineArticleModerationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,d.sub);
      if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
      request.onlineModerationAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };

  app.get('/api/online/articles',{preHandler:auth},async(request,reply)=>{
    const q=z.object({status:z.enum(['relevant','irrelevant','all']).default('relevant'),limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(request.query);
    if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const statusClause=q.data.status==='relevant'?'AND NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.action=\'ONLINE_ARTICLE_MARKED_IRRELEVANT\' AND al.metadata->>\'articleId\'=a.id::text)':q.data.status==='irrelevant'?'AND EXISTS (SELECT 1 FROM audit_logs al WHERE al.action=\'ONLINE_ARTICLE_MARKED_IRRELEVANT\' AND al.metadata->>\'articleId\'=a.id::text)':'';
    const sql=`SELECT a.id,a.source_id,a.opd_id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.summary,ms.name source_name FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE lower(ms.category)='online' AND a.published_at>=NOW()-INTERVAL '7 days' ${statusClause} ORDER BY a.published_at DESC NULLS LAST,a.id DESC LIMIT $1`;
    const rows=(await pool.query(sql,[q.data.limit])).rows;
    for(const row of rows){
      const audit=(await pool.query(`SELECT created_at,metadata->>'reason' reason,user_id FROM audit_logs WHERE action='ONLINE_ARTICLE_MARKED_IRRELEVANT' AND metadata->>'articleId'=$1 ORDER BY created_at DESC LIMIT 1`,[String(row.id)])).rows[0];
      row.relevance_status=audit?'irrelevant':'relevant';
      row.irrelevance_reason=audit?.reason??null;
      row.moderated_at=audit?.created_at??null;
      row.moderated_by=audit?.user_id??null;
    }
    return{data:rows,moderation:{canModerate:canModerate(request.onlineModerationAuth!)}};
  });

  app.post('/api/online/articles/:id/irrelevant',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineModerationAuth!;
    if(!canModerate(ctx))return reply.code(403).send({error:'ONLINE_MODERATION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body=z.object({reason:z.string().trim().min(3).max(500)}).safeParse(request.body);
    if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const article=(await pool.query(`SELECT a.id,a.title,ms.name source_name FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1 AND lower(ms.category)='online'`,[id.data])).rows[0];
    if(!article)return reply.code(404).send({error:'ONLINE_ARTICLE_NOT_FOUND'});
    const linked=await pool.query(`SELECT issue_id FROM issue_articles WHERE article_id=$1 LIMIT 1`,[id.data]);
    if(linked.rowCount)return reply.code(409).send({error:'ARTICLE_ALREADY_LINKED_TO_ISSUE',issueId:linked.rows[0].issue_id});
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'ONLINE_ARTICLE_MARKED_IRRELEVANT',$2)`,[ctx.id,{articleId:String(id.data),title:article.title,sourceName:article.source_name,reason:body.data.reason}]);
    const orgId=await organizationId(pool,ctx);
    if(orgId)await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'UNIFIED_CANDIDATE_ISSUE_IGNORED',$2)`,[ctx.id,{organizationId:orgId,candidateKey:`online:${id.data}`,reason:body.data.reason,source:'online-moderation'}]);
    return{ok:true,data:{articleId:String(id.data),status:'irrelevant',reason:body.data.reason}};
  });
}
