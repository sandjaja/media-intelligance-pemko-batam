import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { rebuildOnlineStoryClusters, clusterNewOnlineArticles } from './online-story-clustering.js';

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
    const {rows}=await pool.query(`SELECT c.id,c.canonical_title,c.representative_article_id,c.member_count,c.source_count,c.first_published_at,c.last_published_at,c.engine_version,c.origin_mode,COALESCE(json_agg(json_build_object('article_id',a.id,'title',a.title,'url',a.url,'published_at',a.published_at,'source_id',a.source_id,'source_name',ms.name,'news_classification',a.news_classification,'opd_id',a.opd_id,'opd_name',o.name,'sentiment',a.sentiment,'risk_score',a.risk_score,'risk_level',a.risk_level,'similarity_score',m.similarity_score,'similarity_type',m.similarity_type,'assignment_mode',m.assignment_mode) ORDER BY a.published_at ASC NULLS LAST,a.id ASC) FILTER(WHERE a.id IS NOT NULL),'[]'::json) publications FROM online_story_clusters c LEFT JOIN online_story_cluster_members m ON m.cluster_id=c.id LEFT JOIN articles a ON a.id=m.article_id LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id WHERE COALESCE(c.last_published_at,c.created_at)>=NOW()-($1::int*INTERVAL '1 day') ${multi} GROUP BY c.id ORDER BY c.last_published_at DESC NULLS LAST,c.id DESC LIMIT $2`,params);
    return{data:rows,totalCount:rows.length};
  });

  app.get('/api/online/story-clusters/regression/:articleId',{preHandler:auth},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).articleId);
    if(!id.success)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});
    const row=(await pool.query(`SELECT c.id cluster_id,c.canonical_title,c.member_count,c.source_count,c.engine_version,json_agg(json_build_object('article_id',a.id,'title',a.title,'source_name',ms.name,'published_at',a.published_at,'similarity_score',m.similarity_score,'similarity_type',m.similarity_type) ORDER BY a.published_at,a.id) members FROM online_story_cluster_members x JOIN online_story_clusters c ON c.id=x.cluster_id JOIN online_story_cluster_members m ON m.cluster_id=c.id JOIN articles a ON a.id=m.article_id LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE x.article_id=$1 GROUP BY c.id`,[id.data])).rows[0];
    if(!row)return reply.code(404).send({error:'ARTICLE_NOT_CLUSTERED'});
    return{data:row};
  });

  app.post('/api/online/story-clusters/manual/move',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineStoryAuth!;if(!canRebuild(ctx))return reply.code(403).send({error:'STORY_CLUSTER_MANUAL_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const body=z.object({articleId:z.coerce.number().int().positive(),clusterId:z.coerce.number().int().positive()}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const client=await pool.connect();try{await client.query('BEGIN');const cluster=(await client.query('SELECT id FROM online_story_clusters WHERE id=$1',[body.data.clusterId])).rows[0];if(!cluster){await client.query('ROLLBACK');return reply.code(404).send({error:'CLUSTER_NOT_FOUND'});}await client.query('DELETE FROM online_story_cluster_members WHERE article_id=$1',[body.data.articleId]);await client.query(`INSERT INTO online_story_cluster_members(cluster_id,article_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'similar','manual','MANUAL')`,[body.data.clusterId,body.data.articleId]);await client.query('UPDATE articles SET story_cluster_manual_excluded=false WHERE id=$1',[body.data.articleId]);await client.query(`UPDATE online_story_clusters c SET member_count=x.member_count,source_count=x.source_count,first_published_at=x.first_published_at,last_published_at=x.last_published_at,updated_at=NOW() FROM (SELECT m.cluster_id,COUNT(*)::int member_count,COUNT(DISTINCT a.source_id)::int source_count,MIN(COALESCE(a.published_at,a.created_at)) first_published_at,MAX(COALESCE(a.published_at,a.created_at)) last_published_at FROM online_story_cluster_members m JOIN articles a ON a.id=m.article_id WHERE m.cluster_id=$1 GROUP BY m.cluster_id)x WHERE c.id=x.cluster_id`,[body.data.clusterId]);await client.query('COMMIT');return{ok:true};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });

  app.post('/api/online/story-clusters/manual/remove',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineStoryAuth!;if(!canRebuild(ctx))return reply.code(403).send({error:'STORY_CLUSTER_MANUAL_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const body=z.object({articleId:z.coerce.number().int().positive()}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const old=(await pool.query('SELECT cluster_id FROM online_story_cluster_members WHERE article_id=$1',[body.data.articleId])).rows[0];await pool.query('DELETE FROM online_story_cluster_members WHERE article_id=$1',[body.data.articleId]);await pool.query('UPDATE articles SET story_cluster_manual_excluded=true WHERE id=$1',[body.data.articleId]);if(old?.cluster_id){await pool.query(`UPDATE online_story_clusters c SET member_count=x.member_count,source_count=x.source_count,representative_article_id=x.representative_article_id,first_published_at=x.first_published_at,last_published_at=x.last_published_at,updated_at=NOW() FROM (SELECT m.cluster_id,COUNT(*)::int member_count,COUNT(DISTINCT a.source_id)::int source_count,(ARRAY_AGG(a.id ORDER BY COALESCE(a.published_at,a.created_at),a.id))[1] representative_article_id,MIN(COALESCE(a.published_at,a.created_at)) first_published_at,MAX(COALESCE(a.published_at,a.created_at)) last_published_at FROM online_story_cluster_members m JOIN articles a ON a.id=m.article_id WHERE m.cluster_id=$1 GROUP BY m.cluster_id)x WHERE c.id=x.cluster_id`,[old.cluster_id]);await pool.query(`DELETE FROM online_story_clusters c WHERE c.id=$1 AND c.origin_mode='SYSTEM' AND NOT EXISTS(SELECT 1 FROM online_story_cluster_members m WHERE m.cluster_id=c.id)`,[old.cluster_id]);await pool.query(`UPDATE online_story_clusters c SET status='ARCHIVED',updated_at=NOW() WHERE c.id=$1 AND c.origin_mode='MANUAL' AND NOT EXISTS(SELECT 1 FROM online_story_cluster_members m WHERE m.cluster_id=c.id)`,[old.cluster_id]);}return{ok:true};
  });

  app.post('/api/online/story-clusters/manual/create',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineStoryAuth!;if(!canRebuild(ctx))return reply.code(403).send({error:'STORY_CLUSTER_MANUAL_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const body=z.object({name:z.string().trim().min(2).max(120),articleId:z.coerce.number().int().positive()}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const client=await pool.connect();try{await client.query('BEGIN');const a=(await client.query('SELECT id,source_id,COALESCE(published_at,created_at) published_at FROM articles WHERE id=$1',[body.data.articleId])).rows[0];if(!a){await client.query('ROLLBACK');return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});}await client.query('DELETE FROM online_story_cluster_members WHERE article_id=$1',[body.data.articleId]);const ins=await client.query(`INSERT INTO online_story_clusters(canonical_title,representative_article_id,member_count,source_count,first_published_at,last_published_at,engine_version,origin_mode,updated_at) VALUES($1,$2,1,1,$3,$3,'manual','MANUAL',NOW()) RETURNING id`,[body.data.name,body.data.articleId,a.published_at]);await client.query(`INSERT INTO online_story_cluster_members(cluster_id,article_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'representative','manual','MANUAL')`,[ins.rows[0].id,body.data.articleId]);await client.query('UPDATE articles SET story_cluster_manual_excluded=false WHERE id=$1',[body.data.articleId]);await client.query('COMMIT');return{ok:true,clusterId:ins.rows[0].id};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });

  app.post('/api/online/story-clusters/incremental',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineStoryAuth!;if(!canRebuild(ctx))return reply.code(403).send({error:'STORY_CLUSTER_UPDATE_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const body=z.object({days:z.coerce.number().int().min(1).max(30).default(7),limit:z.coerce.number().int().min(1).max(500).default(200)}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const result=await clusterNewOnlineArticles(pool,body.data.days,body.data.limit);return{ok:true,result};
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
