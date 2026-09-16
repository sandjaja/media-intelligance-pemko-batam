import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { rebuildOnlineStoryClusters } from './online-story-clustering.js';

declare module 'fastify' { interface FastifyRequest { onlineStoryAuth?: AuthorizationContext } }
const canRebuild=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');

export async function registerOnlineStoryClusterRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:FastifyReply)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const decoded=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof decoded.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,decoded.sub);
      if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
      request.onlineStoryAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };

  app.get('/api/online/story-clusters',{preHandler:auth},async(request,reply)=>{
    const q=z.object({days:z.coerce.number().int().min(1).max(30).default(7),limit:z.coerce.number().int().min(1).max(300).default(100),multiSource:z.enum(['all','yes']).default('all')}).safeParse(request.query);
    if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const params:unknown[]=[q.data.days,q.data.limit];
    const multi=q.data.multiSource==='yes'?'AND c.source_count>1':'';
    const {rows}=await pool.query(`SELECT c.id,c.canonical_title,c.representative_article_id,c.member_count,c.source_count,c.first_published_at,c.last_published_at,c.engine_version,COALESCE(json_agg(json_build_object('article_id',a.id,'title',a.title,'url',a.url,'published_at',a.published_at,'source_id',a.source_id,'source_name',ms.name,'news_classification',a.news_classification,'opd_id',a.opd_id,'opd_name',o.name,'sentiment',a.sentiment,'risk_score',a.risk_score,'risk_level',a.risk_level,'similarity_score',m.similarity_score,'similarity_type',m.similarity_type) ORDER BY a.published_at ASC NULLS LAST,a.id ASC) FILTER(WHERE a.id IS NOT NULL),'[]'::json) publications FROM online_story_clusters c LEFT JOIN online_story_cluster_members m ON m.cluster_id=c.id LEFT JOIN articles a ON a.id=m.article_id LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id WHERE COALESCE(c.last_published_at,c.created_at)>=NOW()-($1::int*INTERVAL '1 day') ${multi} GROUP BY c.id ORDER BY c.last_published_at DESC NULLS LAST,c.id DESC LIMIT $2`,params);
    return{data:rows,totalCount:rows.length};
  });

  app.get('/api/online/story-clusters/regression/:articleId',{preHandler:auth},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).articleId);
    if(!id.success)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});
    const row=(await pool.query(`SELECT c.id cluster_id,c.canonical_title,c.member_count,c.source_count,c.engine_version,json_agg(json_build_object('article_id',a.id,'title',a.title,'source_name',ms.name,'published_at',a.published_at,'similarity_score',m.similarity_score,'similarity_type',m.similarity_type) ORDER BY a.published_at,a.id) members FROM online_story_cluster_members x JOIN online_story_clusters c ON c.id=x.cluster_id JOIN online_story_cluster_members m ON m.cluster_id=c.id JOIN articles a ON a.id=m.article_id LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE x.article_id=$1 GROUP BY c.id`,[id.data])).rows[0];
    if(!row)return reply.code(404).send({error:'ARTICLE_NOT_CLUSTERED'});
    return{data:row};
  });

  app.post('/api/online/story-clusters/rebuild',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineStoryAuth!;
    if(!canRebuild(ctx))return reply.code(403).send({error:'STORY_CLUSTER_REBUILD_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const body=z.object({days:z.coerce.number().int().min(1).max(30).default(7),limit:z.coerce.number().int().min(2).max(2000).default(1000)}).safeParse(request.body??{});
    if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const result=await rebuildOnlineStoryClusters(pool,body.data.days,body.data.limit);
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'ONLINE_STORY_CLUSTERS_REBUILT',$2)`,[(ctx as any).userId??null,{...result,days:body.data.days,limit:body.data.limit}]).catch(()=>undefined);
    return{ok:true,result};
  });
}
