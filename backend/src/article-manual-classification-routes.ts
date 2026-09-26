import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { analyzeArticle } from './analyzer-v14.js';
import { clearSupportingIntelligenceLinks } from './news-classification.js';
import { linkEligibleOnline } from './issue-monitor-matcher.js';
import { detectUnifiedIssueCandidates } from './unified-candidate-issues.js';
import { recalculateIssueRisk } from './issue-risk.js';

declare module 'fastify' { interface FastifyRequest { articleCorrectionAuth?: AuthorizationContext } }
const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
async function audit(client:Pool|PoolClient,userId:string,action:string,metadata:any){await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,$2,$3)`,[userId,action,metadata]);}
async function refreshUnifiedIssueResolution(pool:Pool,organizationId:number,articleId:number,log?:(o:any,m:string)=>void){try{const candidates=await detectUnifiedIssueCandidates(pool,organizationId,{sourceType:'online',evidenceId:articleId});const matched=candidates.filter((candidate:any)=>(candidate.evidence||[]).some((e:any)=>e.sourceType==='online'&&Number(e.id)===articleId));return{ok:true,candidateCount:matched.length,candidateKeys:matched.map((x:any)=>x.candidateKey)};}catch(error){log?.({err:error,articleId},'Unified Issue resolution refresh skipped');return{ok:false,candidateCount:0,candidateKeys:[]};}}
async function resolveOrganizationId(pool:Pool,ctx:AuthorizationContext){if(ctx.opdId){const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);if(r.rows[0]?.organization_id)return Number(r.rows[0].organization_id);}const r=await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2');return r.rowCount===1?Number(r.rows[0].id):0;}

export async function registerArticleManualClassificationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.articleCorrectionAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
 const manager=async(request:FastifyRequest,reply:any)=>{await auth(request,reply);if(reply.sent)return;if(!canManage(request.articleCorrectionAuth!))return reply.code(403).send({error:'HUMAS_OR_SUPER_ADMIN_REQUIRED'});};
 async function isVerifiedLocked(articleId:number){const r=await pool.query(`SELECT action FROM audit_logs WHERE action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND metadata->>'articleId'=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[String(articleId)]);return r.rows[0]?.action==='ARTICLE_CLASSIFICATION_VERIFIED';}
 const org=async(request:FastifyRequest,reply:any)=>{const id=await resolveOrganizationId(pool,request.articleCorrectionAuth!);if(!id){reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});return 0;}return id;};

 app.get('/api/admin/articles/:id/classification-correction',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id);if(!Number.isInteger(articleId)||articleId<=0)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});const article=(await pool.query(`SELECT id,title,news_classification,news_classification_source,news_classification_changed_by,news_classification_changed_at FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});const selected=(await pool.query(`SELECT amk.keyword_id,k.keyword,kt.category_id,t.name taxonomy_name,s.id sector_id,s.name sector_name,ko.opd_id,o.name opd_name,ko.routing_role,amk.keyword_role,amk.reason,amk.selected_by,amk.updated_at FROM article_manual_keywords amk JOIN keywords k ON k.id=amk.keyword_id JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true LEFT JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE amk.article_id=$1 AND amk.active=true AND k.organization_id=$2 ORDER BY k.keyword,CASE WHEN ko.routing_role='PRIMARY' THEN 0 ELSE 1 END,o.name`,[articleId,organizationId])).rows;const verification=(await pool.query(`SELECT action,created_at,user_id,metadata FROM audit_logs WHERE action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED','ARTICLE_CLASSIFICATION_KEYWORD_CORRECTED','ARTICLE_CLASSIFICATION_SET_SUPPORTING') AND metadata->>'articleId'=$1 ORDER BY created_at DESC LIMIT 1`,[String(articleId)])).rows[0]??null;return{data:{article,selected,verification}};});

 app.get('/api/admin/articles/:id/classification-keywords',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id),q=String((request.query as any)?.q||'').trim();if(!Number.isInteger(articleId)||articleId<=0)return reply.code(400).send({error:'INVALID_ARTICLE_ID'});const params:any[]=[organizationId];let search='',order='kt.weight DESC,k.keyword';if(q){params.push(`%${q}%`);search=` AND (k.keyword ILIKE $2 OR t.name ILIKE $2 OR s.name ILIKE $2)`;order=`CASE WHEN lower(k.keyword)=lower($2) THEN 0 ELSE 1 END,kt.weight DESC,k.keyword`;}const rows=(await pool.query(`SELECT k.id keyword_id,k.keyword,kt.weight,t.id taxonomy_id,t.name taxonomy_name,s.id sector_id,s.name sector_name,(SELECT jsonb_agg(jsonb_build_object('opdId',ko.opd_id,'opdName',o.name,'role',ko.routing_role) ORDER BY CASE WHEN ko.routing_role='PRIMARY' THEN 0 ELSE 1 END,o.name) FROM keyword_opd ko JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE ko.keyword_id=k.id AND ko.active=true) routing FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true WHERE k.organization_id=$1 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL ${search} ORDER BY ${order} LIMIT 80`,params)).rows;return{data:rows};});

 async function correctKeyword(articleId:number,organizationId:number,keywordIds:number[],primaryKeywordId:number,reason:string,actor:AuthorizationContext,article:any){
  const ids=[...new Set(keywordIds)];
  if(ids.length!==keywordIds.length)return{error:'DUPLICATE_KEYWORD' as const};
  if(ids.length>3)return{error:'TOO_MANY_KEYWORDS' as const};
  if(!ids.includes(primaryKeywordId))return{error:'PRIMARY_KEYWORD_REQUIRED' as const};
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const valid=(await client.query(`SELECT k.id,k.keyword,COUNT(*) FILTER(WHERE ko.routing_role='PRIMARY' AND ko.active=true AND o.active=true)::int primary_count FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true JOIN classification_sectors s ON s.id=t.sector_id AND s.active=true LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id LEFT JOIN opd o ON o.id=ko.opd_id WHERE k.id=ANY($1::bigint[]) AND k.organization_id=$2 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL GROUP BY k.id,k.keyword`,[ids,organizationId])).rows;
   if(valid.length!==ids.length||valid.some((r:any)=>Number(r.primary_count)!==1)){await client.query('ROLLBACK');return{error:'KEYWORD_REQUIRES_EXACTLY_ONE_PRIMARY_OPD' as const};}
   const before={classification:article.news_classification,source:article.news_classification_source};
   await client.query(`UPDATE article_manual_keywords SET active=false,updated_at=NOW() WHERE article_id=$1 AND active=true`,[articleId]);
   for(const keywordId of ids){const role=keywordId===primaryKeywordId?'PRIMARY':'RELATED';await client.query(`INSERT INTO article_manual_keywords(article_id,keyword_id,selected_by,reason,active,keyword_role,created_at,updated_at) VALUES($1,$2,$3,$4,true,$5,NOW(),NOW()) ON CONFLICT(article_id,keyword_id) DO UPDATE SET selected_by=EXCLUDED.selected_by,reason=EXCLUDED.reason,active=true,keyword_role=EXCLUDED.keyword_role,updated_at=NOW()`,[articleId,keywordId,actor.id,reason||null,role]);}
   await client.query(`UPDATE articles SET news_classification='UTAMA',news_classification_source='MANUAL',news_classification_changed_by=$2,news_classification_changed_at=NOW() WHERE id=$1`,[articleId,actor.id]);
   const result=await analyzeArticle(client as unknown as Pool,String(articleId));
   if(!result?.opdId)throw new Error('MANUAL_KEYWORD_DID_NOT_PRODUCE_PRIMARY_OPD');
   await audit(client,actor.id,'ARTICLE_CLASSIFICATION_KEYWORD_CORRECTED',{organizationId,articleId:String(articleId),title:article.title,before,after:{classification:'UTAMA',source:'MANUAL'},keywordIds:ids,primaryKeywordId,keywords:valid.map((r:any)=>r.keyword),primaryOpdId:result.opdId,reason:reason||null});
   await audit(client,actor.id,'ARTICLE_CLASSIFICATION_VERIFIED',{organizationId,articleId:String(articleId),title:article.title,before,after:{classification:'UTAMA',source:'MANUAL'},verificationSource:'MANUAL_KEYWORD_CORRECTION',keywordIds:ids,primaryKeywordId,keywords:valid.map((r:any)=>r.keyword),primaryOpdId:result.opdId,reason:reason||null});
   await client.query('COMMIT');
   let issueMonitorMatches=0;try{const evidence=(await pool.query(`SELECT a.published_at,a.title,COALESCE(a.content,a.summary,'') content,(SELECT kt.category_id FROM article_manual_keywords amk JOIN keyword_taxonomy kt ON kt.keyword_id=amk.keyword_id AND kt.active=true WHERE amk.article_id=a.id AND amk.active=true ORDER BY CASE WHEN amk.keyword_role='PRIMARY' THEN 0 WHEN amk.keyword_role IS NULL THEN 1 ELSE 2 END,kt.weight DESC LIMIT 1) taxonomy_id FROM articles a WHERE a.id=$1`,[articleId])).rows[0];if(evidence)issueMonitorMatches=(await linkEligibleOnline(pool,{articleId,publishedAt:evidence.published_at,title:evidence.title,content:evidence.content,taxonomyId:evidence.taxonomy_id?Number(evidence.taxonomy_id):null})).length;}catch{}
   const unifiedIssue=await refreshUnifiedIssueResolution(pool,organizationId,articleId); return{data:{articleId:String(articleId),classification:'UTAMA',source:'MANUAL',verificationStatus:'LOCKED',keywordIds:ids,primaryKeywordId,routing:result,issueMonitorMatches,unifiedIssue}};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }

 // Backward-compatible endpoint used by the existing Koreksi Klasifikasi UI.
 // It now has the same semantics as CORRECT_KEYWORD so a manual keyword can never leave an AUTO/PENDUKUNG article with an OPD.
 app.put('/api/admin/articles/:id/classification-keywords',{preHandler:manager},async(request,reply)=>{const organizationId=await org(request,reply);if(!organizationId)return;const articleId=Number((request.params as any).id);if(await isVerifiedLocked(articleId))return reply.code(423).send({error:'ARTICLE_CLASSIFICATION_LOCKED'});const p=z.object({keywordIds:z.array(z.number().int().positive()).min(1).max(3),primaryKeywordId:z.number().int().positive(),reason:z.string().trim().max(1000).optional().default('')}).safeParse(request.body);if(!Number.isInteger(articleId)||articleId<=0||!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});const article=(await pool.query(`SELECT a.id,a.title,a.news_classification,a.news_classification_source,ms.category media_category FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});if(String(article.media_category||'').toLowerCase()!=='online')return reply.code(409).send({error:'ONLINE_ARTICLE_REQUIRED'});try{const out=await correctKeyword(articleId,organizationId,p.data.keywordIds,p.data.primaryKeywordId,p.data.reason,request.articleCorrectionAuth!,article);if('error' in out)return reply.code(400).send({error:out.error});return{ok:true,data:{...out.data,action:'CORRECT_KEYWORD'}};}catch(e){request.log.error({err:e,articleId},'legacy classification correction failed');return reply.code(409).send({error:'CLASSIFICATION_VERIFICATION_FAILED',message:e instanceof Error?e.message:String(e)});}});


 app.post('/api/admin/articles/:id/issue-linkage-refresh',{preHandler:manager},async(request,reply)=>{
  const organizationId=await org(request,reply);if(!organizationId)return;
  const articleId=Number((request.params as any).id);
  if(!Number.isInteger(articleId)||articleId<=0)return reply.code(400).send({error:'INVALID_REQUEST'});
  const article=(await pool.query(`SELECT a.id,a.title,a.news_classification,ms.category media_category FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];
  if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});
  if(String(article.media_category||'').toLowerCase()!=='online')return reply.code(409).send({error:'ONLINE_ARTICLE_REQUIRED'});
  if(article.news_classification!=='UTAMA')return reply.code(409).send({error:'PRIMARY_ARTICLE_REQUIRED'});
  const result=await refreshUnifiedIssueResolution(pool,organizationId,articleId,(o,m)=>request.log.warn(o,m));
  await audit(pool,request.articleCorrectionAuth!.id,'ARTICLE_ISSUE_LINKAGE_REFRESHED',{organizationId,articleId:String(articleId),title:article.title,result});
  if(!result.ok)return reply.code(409).send({error:'ISSUE_LINKAGE_REFRESH_FAILED',data:result});
  return{ok:true,data:{articleId:String(articleId),action:'REFRESH_ISSUE_LINKAGE',unifiedIssue:result}};
 });

 app.post('/api/admin/articles/:id/classification-verification',{preHandler:manager},async(request,reply)=>{
  const organizationId=await org(request,reply);if(!organizationId)return;
  const articleId=Number((request.params as any).id);
  const locked=Number.isInteger(articleId)&&articleId>0?await isVerifiedLocked(articleId):false;
  if(locked&&(request.body as any)?.action!=='REOPEN')return reply.code(423).send({error:'ARTICLE_CLASSIFICATION_LOCKED'});
  const p=z.discriminatedUnion('action',[
   z.object({action:z.literal('APPROVE'),reason:z.string().trim().max(1000).optional().default('')}),
   z.object({action:z.literal('CORRECT_KEYWORD'),keywordIds:z.array(z.number().int().positive()).min(1).max(3),primaryKeywordId:z.number().int().positive(),reason:z.string().trim().max(1000).optional().default('')}),
   z.object({action:z.literal('SET_SUPPORTING'),reason:z.string().trim().min(3).max(1000)}),
   z.object({action:z.literal('REOPEN'),reason:z.string().trim().min(3).max(1000)})
  ]).safeParse(request.body);
  if(!Number.isInteger(articleId)||articleId<=0||!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  const actor=request.articleCorrectionAuth!;
  const article=(await pool.query(`SELECT a.id,a.title,a.news_classification,a.news_classification_source,ms.category media_category FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];
  if(!article)return reply.code(404).send({error:'ARTICLE_NOT_FOUND'});
  if(String(article.media_category||'').toLowerCase()!=='online')return reply.code(409).send({error:'ONLINE_ARTICLE_REQUIRED'});
  const before={classification:article.news_classification,source:article.news_classification_source};
  if(p.data.action==='REOPEN'){
   if(!locked)return reply.code(409).send({error:'ARTICLE_CLASSIFICATION_NOT_LOCKED'});
   await audit(pool,actor.id,'ARTICLE_CLASSIFICATION_REOPENED',{organizationId,articleId:String(articleId),title:article.title,before,reason:p.data.reason,riskStatus:'PROVISIONAL'});
   const affectedIssueIds=(await pool.query(`SELECT DISTINCT issue_id FROM issue_articles WHERE article_id=$1`,[articleId])).rows.map((row:any)=>Number(row.issue_id)).filter(Number.isFinite);
   for(const issueId of affectedIssueIds)await recalculateIssueRisk(pool,issueId);
   return{ok:true,data:{articleId:String(articleId),action:'REOPEN',verificationStatus:'REOPENED',riskStatus:'PROVISIONAL',classification:article.news_classification,source:article.news_classification_source}};
  }
  if(p.data.action==='APPROVE'){
   // Only primary news may enter the verified/locked state used by Issue Evidence.
   // Supporting news stays reviewable so it can still be promoted by choosing a Primary Keyword.
   if(article.news_classification!=='UTAMA')return reply.code(409).send({error:'PRIMARY_ARTICLE_REQUIRED_FOR_VERIFICATION'});
   const readiness=await analyzeArticle(pool,String(articleId));
   if(!readiness||readiness.newsClassification!=='UTAMA'||readiness.routingStatus!=='ROUTED'||!readiness.opdId||Number(readiness.keywordMatches||0)<1)return reply.code(409).send({error:'PRIMARY_ARTICLE_NOT_READY_FOR_VERIFICATION'});
   await audit(pool,actor.id,'ARTICLE_CLASSIFICATION_VERIFIED',{organizationId,articleId:String(articleId),title:article.title,before,after:before,reason:p.data.reason||null,riskStatus:'FINAL',riskFinalizedAt:new Date().toISOString()});
   let issueMonitorMatches=0;
   if(article.news_classification==='UTAMA'){try{const evidence=(await pool.query(`SELECT a.published_at,a.title,COALESCE(a.content,a.summary,'') content,(SELECT kt.category_id FROM article_manual_keywords amk JOIN keyword_taxonomy kt ON kt.keyword_id=amk.keyword_id AND kt.active=true WHERE amk.article_id=a.id AND amk.active=true ORDER BY CASE WHEN amk.keyword_role='PRIMARY' THEN 0 WHEN amk.keyword_role IS NULL THEN 1 ELSE 2 END,kt.weight DESC LIMIT 1) taxonomy_id FROM articles a WHERE a.id=$1`,[articleId])).rows[0];if(evidence){issueMonitorMatches=(await linkEligibleOnline(pool,{articleId,publishedAt:evidence.published_at,title:evidence.title,content:evidence.content,taxonomyId:evidence.taxonomy_id?Number(evidence.taxonomy_id):null})).length;}}catch(e){request.log.warn({err:e,articleId},'Issue Monitor online linkage skipped');}}
   if(article.news_classification==='UTAMA')void refreshUnifiedIssueResolution(pool,organizationId,articleId,(o,m)=>request.log.warn(o,m)); return{ok:true,data:{articleId:String(article.id),action:'APPROVE',riskStatus:'FINAL',classification:article.news_classification,source:article.news_classification_source,issueMonitorMatches,unifiedIssue:{queued:article.news_classification==='UTAMA'}}};
  }
  if(p.data.action==='CORRECT_KEYWORD'){
   try{const out=await correctKeyword(articleId,organizationId,p.data.keywordIds,p.data.primaryKeywordId,p.data.reason,actor,article);if('error' in out)return reply.code(400).send({error:out.error});return{ok:true,data:{...out.data,action:'CORRECT_KEYWORD'}};}catch(e){request.log.error({err:e,articleId},'classification keyword correction failed');return reply.code(409).send({error:'CLASSIFICATION_VERIFICATION_FAILED',message:e instanceof Error?e.message:String(e)});}
  }
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const affectedIssueIds=(await client.query(`SELECT DISTINCT issue_id FROM issue_articles WHERE article_id=$1`,[articleId])).rows.map((row:any)=>Number(row.issue_id)).filter(Number.isFinite);
   await client.query(`UPDATE article_manual_keywords SET active=false,updated_at=NOW() WHERE article_id=$1 AND active=true`,[articleId]);
   await client.query(`UPDATE articles SET news_classification='PENDUKUNG',news_classification_source='MANUAL',news_classification_changed_by=$2,news_classification_changed_at=NOW() WHERE id=$1`,[articleId,actor.id]);
   await clearSupportingIntelligenceLinks(client as unknown as Pool,String(articleId));
   for(const issueId of affectedIssueIds)await recalculateIssueRisk(client,issueId);
   await client.query(`UPDATE articles SET sentiment=NULL,sentiment_score=NULL,risk_score=NULL,risk_level=NULL,importance_score=NULL,impact_score=NULL,velocity_score=NULL,updated_at=NOW() WHERE id=$1`,[articleId]);
   await audit(client,actor.id,'ARTICLE_CLASSIFICATION_SET_SUPPORTING',{organizationId,articleId:String(articleId),title:article.title,before,after:{classification:'PENDUKUNG',source:'MANUAL'},reason:p.data.reason,riskStatus:'NOT_ANALYZED',riskScore:null,riskLevel:null});
   await client.query('COMMIT');
   return{ok:true,data:{articleId:String(articleId),action:'SET_SUPPORTING',verificationStatus:'SUPPORTING_CONFIRMED',riskStatus:'NOT_ANALYZED',risk:null,classification:'PENDUKUNG',source:'MANUAL'}};
  }catch(e){await client.query('ROLLBACK');request.log.error({err:e,articleId},'classification verification failed');return reply.code(409).send({error:'CLASSIFICATION_VERIFICATION_FAILED',message:e instanceof Error?e.message:String(e)});}finally{client.release();}
 });
}
