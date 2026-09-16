import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { routeArticleHeadline } from './analyzer.js';
import { analyzeArticle } from './analyzer-v14.js';
import { clearSupportingIntelligenceLinks } from './news-classification.js';

declare module 'fastify' { interface FastifyRequest { articleCorrectionAuth?: AuthorizationContext } }
const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
async function audit(client:Pool|PoolClient,userId:string,action:string,metadata:any){await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,$2,$3)`,[userId,action,metadata]);}
async function resolveOrganizationId(pool:Pool,ctx:AuthorizationContext){if(ctx.opdId){const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);if(r.rows[0]?.organization_id)return Number(r.rows[0].organization_id);}const r=await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2');return r.rowCount===1?Number(r.rows[0].id):0;}

export async function registerArticleManualClassificationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.articleCorrectionAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
 const manager=async(request:FastifyRequest,reply:any)=>{await auth(request,reply);if(reply.sent)return;if(!canManage(request.articleCorrectionAuth!))return reply.code(403).send({error:'HUMAS_OR_SUPER_ADMIN_REQUIRED'});};
 const org=async(request:FastifyRequest,reply:any)=>{const id=await resolveOrganizationId(pool,request.articleCorrectionAuth!);if(!id){reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});return 0;}return id;};

 app.get('/api/admin/articles/:id/classification-correction',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id);if(!Number.isInteger(articleId)||articleId<=0)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});const article=(await pool.query(`SELECT id,title,news_classification,news_classification_source,news_classification_changed_by,news_classification_changed_at FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});const selected=(await pool.query(`SELECT amk.keyword_id,k.keyword,kt.category_id,t.name taxonomy_name,s.id sector_id,s.name sector_name,ko.opd_id,o.name opd_name,ko.routing_role,amk.reason,amk.selected_by,amk.updated_at FROM article_manual_keywords amk JOIN keywords k ON k.id=amk.keyword_id JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true LEFT JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE amk.article_id=$1 AND amk.active=true AND k.organization_id=$2 ORDER BY k.keyword,CASE WHEN ko.routing_role='PRIMARY' THEN 0 ELSE 1 END,o.name`,[articleId,organizationId])).rows;const verification=(await pool.query(`SELECT action,created_at,user_id,metadata FROM audit_logs WHERE action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_KEYWORD_CORRECTED','ARTICLE_CLASSIFICATION_SET_SUPPORTING') AND metadata->>'articleId'=$1 ORDER BY created_at DESC LIMIT 1`,[String(articleId)])).rows[0]??null;return{data:{article,selected,verification}};});

 app.get('/api/admin/articles/:id/classification-keywords',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id),q=String((request.query as any)?.q||'').trim();if(!Number.isInteger(articleId)||articleId<=0)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});const params:any[]=[organizationId];let search='',order='kt.weight DESC,k.keyword';if(q){params.push(`%${q}%`);search=` AND (k.keyword ILIKE $2 OR t.name ILIKE $2 OR s.name ILIKE $2)`;order=`CASE WHEN lower(k.keyword)=lower($2) THEN 0 ELSE 1 END,kt.weight DESC,k.keyword`;}const rows=(await pool.query(`SELECT k.id keyword_id,k.keyword,kt.weight,t.id taxonomy_id,t.name taxonomy_name,s.id sector_id,s.name sector_name,(SELECT jsonb_agg(jsonb_build_object('opdId',ko.opd_id,'opdName',o.name,'role',ko.routing_role) ORDER BY CASE WHEN ko.routing_role='PRIMARY' THEN 0 ELSE 1 END,o.name) FROM keyword_opd ko JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE ko.keyword_id=k.id AND ko.active=true) routing FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true WHERE k.organization_id=$1 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL ${search} ORDER BY ${order} LIMIT 80`,params)).rows;return{data:rows};});

 app.put('/api/admin/articles/:id/classification-keywords',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id);const p=z.object({keywordIds:z.array(z.number().int().positive()).min(1).max(8),reason:z.string().trim().max(1000).optional().default('')}).safeParse(request.body);if(!Number.isInteger(articleId)||articleId<=0||!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});const ids=[...new Set(p.data.keywordIds)];if(ids.length!==p.data.keywordIds.length)return reply.code(400).send({error:'DUPLICATE_KEYWORD'});const article=(await pool.query(`SELECT id FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});const valid=(await pool.query(`SELECT k.id FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true WHERE k.id=ANY($1::bigint[]) AND k.organization_id=$2 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL`,[ids,organizationId])).rows.map((r:any)=>Number(r.id));if(valid.length!==ids.length)return reply.code(400).send({error:'INVALID_MASTER_KEYWORD'});const client=await pool.connect();try{await client.query('BEGIN');await client.query(`UPDATE article_manual_keywords SET active=false,updated_at=now() WHERE article_id=$1 AND active=true`,[articleId]);for(const keywordId of ids)await client.query(`INSERT INTO article_manual_keywords(article_id,keyword_id,selected_by,reason,active,created_at,updated_at) VALUES($1,$2,$3,$4,true,now(),now()) ON CONFLICT(article_id,keyword_id) DO UPDATE SET selected_by=EXCLUDED.selected_by,reason=EXCLUDED.reason,active=true,updated_at=now()`,[articleId,keywordId,request.articleCorrectionAuth!.id,p.data.reason||null]);await audit(client,request.articleCorrectionAuth!.id,'ARTICLE_CLASSIFICATION_KEYWORDS_MANUAL',{organizationId,articleId,keywordIds:ids,reason:p.data.reason||null});await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}const result=await routeArticleHeadline(pool,String(articleId));return{ok:true,data:{articleId,keywordIds:ids,routing:result}};});

 app.post('/api/admin/articles/:id/classification-verification',{preHandler:manager},async(request,reply)=>{
  const organizationId=await org(request,reply);if(!organizationId)return;
  const articleId=Number((request.params as any).id);
  const p=z.discriminatedUnion('action',[
   z.object({action:z.literal('APPROVE'),reason:z.string().trim().max(1000).optional().default('')}),
   z.object({action:z.literal('CORRECT_KEYWORD'),keywordIds:z.array(z.number().int().positive()).min(1).max(8),reason:z.string().trim().max(1000).optional().default('')}),
   z.object({action:z.literal('SET_SUPPORTING'),reason:z.string().trim().min(3).max(1000)})
  ]).safeParse(request.body);
  if(!Number.isInteger(articleId)||articleId<=0||!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  const actor=request.articleCorrectionAuth!;
  const article=(await pool.query(`SELECT a.id,a.title,a.news_classification,a.news_classification_source,ms.category media_category FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];
  if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});
  if(String(article.media_category||'').toLowerCase()!=='online')return reply.code(409).send({error:'ONLINE_ARTICLE_REQUIRED'});
  const before={classification:article.news_classification,source:article.news_classification_source};
  if(p.data.action==='APPROVE'){
   if(article.news_classification!=='UTAMA'&&article.news_classification!=='PENDUKUNG')return reply.code(409).send({error:'ARTICLE_NOT_CLASSIFIED'});
   await audit(pool,actor.id,'ARTICLE_CLASSIFICATION_VERIFIED',{organizationId,articleId:String(articleId),title:article.title,before,after:before,reason:p.data.reason||null});
   return{ok:true,data:{articleId:String(articleId),action:'APPROVE',classification:article.news_classification,source:article.news_classification_source}};
  }
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const tx=client as unknown as Pool;
   if(p.data.action==='SET_SUPPORTING'){
    await client.query(`UPDATE article_manual_keywords SET active=false,updated_at=NOW() WHERE article_id=$1 AND active=true`,[articleId]);
    await client.query(`UPDATE articles SET news_classification='PENDUKUNG',news_classification_source='MANUAL',news_classification_changed_by=$2,news_classification_changed_at=NOW(),risk_score=0,risk_level='low',is_highlight=false WHERE id=$1`,[articleId,actor.id]);
    await clearSupportingIntelligenceLinks(tx,String(articleId));
    await audit(client,actor.id,'ARTICLE_CLASSIFICATION_SET_SUPPORTING',{organizationId,articleId:String(articleId),title:article.title,before,after:{classification:'PENDUKUNG',source:'MANUAL'},reason:p.data.reason});
    await client.query('COMMIT');
    return{ok:true,data:{articleId:String(articleId),action:'SET_SUPPORTING',classification:'PENDUKUNG',source:'MANUAL'}};
   }
   const ids=[...new Set(p.data.keywordIds)];
   if(ids.length!==p.data.keywordIds.length){await client.query('ROLLBACK');return reply.code(400).send({error:'DUPLICATE_KEYWORD'});}
   const valid=(await client.query(`SELECT k.id,k.keyword,COUNT(*) FILTER(WHERE ko.routing_role='PRIMARY' AND ko.active=true AND o.active=true)::int primary_count FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id LEFT JOIN opd o ON o.id=ko.opd_id WHERE k.id=ANY($1::bigint[]) AND k.organization_id=$2 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL GROUP BY k.id,k.keyword`,[ids,organizationId])).rows;
   if(valid.length!==ids.length||valid.some((r:any)=>Number(r.primary_count)!==1)){await client.query('ROLLBACK');return reply.code(400).send({error:'KEYWORD_REQUIRES_EXACTLY_ONE_PRIMARY_OPD'});}
   await client.query(`UPDATE article_manual_keywords SET active=false,updated_at=NOW() WHERE article_id=$1 AND active=true`,[articleId]);
   for(const keywordId of ids)await client.query(`INSERT INTO article_manual_keywords(article_id,keyword_id,selected_by,reason,active,created_at,updated_at) VALUES($1,$2,$3,$4,true,NOW(),NOW()) ON CONFLICT(article_id,keyword_id) DO UPDATE SET selected_by=EXCLUDED.selected_by,reason=EXCLUDED.reason,active=true,updated_at=NOW()`,[articleId,keywordId,actor.id,p.data.reason||null]);
   await client.query(`UPDATE articles SET news_classification='UTAMA',news_classification_source='MANUAL',news_classification_changed_by=$2,news_classification_changed_at=NOW() WHERE id=$1`,[articleId,actor.id]);
   const result=await analyzeArticle(tx,String(articleId));
   if(!result?.opdId)throw new Error('MANUAL_KEYWORD_DID_NOT_PRODUCE_PRIMARY_OPD');
   await audit(client,actor.id,'ARTICLE_CLASSIFICATION_KEYWORD_CORRECTED',{organizationId,articleId:String(articleId),title:article.title,before,after:{classification:'UTAMA',source:'MANUAL'},keywordIds:ids,keywords:valid.map((r:any)=>r.keyword),primaryOpdId:result.opdId,reason:p.data.reason||null});
   await client.query('COMMIT');
   return{ok:true,data:{articleId:String(articleId),action:'CORRECT_KEYWORD',classification:'UTAMA',source:'MANUAL',keywordIds:ids,routing:result}};
  }catch(e){await client.query('ROLLBACK');request.log.error({err:e,articleId},'classification verification failed');return reply.code(409).send({error:'CLASSIFICATION_VERIFICATION_FAILED',message:e instanceof Error?e.message:String(e)});}finally{client.release();}
 });
}
