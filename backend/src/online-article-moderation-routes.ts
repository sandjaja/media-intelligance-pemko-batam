import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { collectOnlineSource } from './online-media-collector.js';
import { analyzeArticle, routeArticleHeadline } from './analyzer.js';

declare module 'fastify' { interface FastifyRequest { onlineModerationAuth?: AuthorizationContext } }
const canModerate=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
async function organizationId(pool:Pool,ctx:AuthorizationContext){if(ctx.opdId){const r=await pool.query(`SELECT organization_id FROM opd WHERE id=$1`,[ctx.opdId]);if(r.rows[0]?.organization_id)return Number(r.rows[0].organization_id);}const r=await pool.query(`SELECT id FROM organizations ORDER BY id LIMIT 2`);return r.rowCount===1?Number(r.rows[0].id):0;}
const relevanceClause=(status:'relevant'|'irrelevant'|'all',alias='a')=>status==='relevant'?`AND NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.action='ONLINE_ARTICLE_MARKED_IRRELEVANT' AND al.metadata->>'articleId'=${alias}.id::text)`:status==='irrelevant'?`AND EXISTS (SELECT 1 FROM audit_logs al WHERE al.action='ONLINE_ARTICLE_MARKED_IRRELEVANT' AND al.metadata->>'articleId'=${alias}.id::text)`:'';
const canonical=(v:string)=>String(v||'').toLowerCase().normalize('NFKC').replace(/\s*[-–—|]\s*(jawa\s*pos|batam\s*pos|antara(?:\s*news)?|tribun(?:news|\s*batam)?)(?:\.com)?\s*$/i,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const similarity=(a:string,b:string)=>{const A=new Set(canonical(a).split(' ').filter(x=>x.length>2)),B=new Set(canonical(b).split(' ').filter(x=>x.length>2));if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)};
const duplicate=(title:string,known:string[])=>{const c=canonical(title);return known.some(k=>{const d=canonical(k);if(!c||!d)return false;if(c===d)return true;const s=c.length<=d.length?c:d,l=c.length>d.length?c:d;if(l.includes(s)&&s.length/l.length>=.82)return true;return similarity(c,d)>=.84;});};
function healthTarget(url:string){try{const u=new URL(url);if(/(^|\.)batampos\.co\.id$/i.test(u.hostname))return'https://batampos.jawapos.com/batam';return u.toString();}catch{return url}}
async function probeUrl(url:string){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),5500);try{const r=await fetch(url,{method:'GET',redirect:'follow',signal:ctrl.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; PemkoBatamMediaIntelligence/health; +https://mediacenter.batam.go.id/)','accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'id-ID,id;q=0.9'}});try{await r.body?.cancel();}catch{}return{ok:r.ok,status:r.status,finalUrl:r.url||url};}finally{clearTimeout(timer)}}

export async function registerOnlineArticleModerationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.onlineModerationAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};

  app.get('/api/online/articles',{preHandler:auth},async(request,reply)=>{
    const q=z.object({status:z.enum(['relevant','irrelevant','all']).default('relevant'),limit:z.coerce.number().int().min(1).max(300).default(100)}).safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const statusClause=relevanceClause(q.data.status);
    const raw=(await pool.query(`SELECT a.id,a.source_id,a.opd_id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.summary,ms.name source_name,o.name opd_name,COALESCE((SELECT json_agg(ae.entity_name ORDER BY ae.entity_name) FROM article_entities ae WHERE ae.article_id=a.id AND ae.entity_type='keyword'),'[]'::json) matched_keywords,EXISTS(SELECT 1 FROM issue_articles ia WHERE ia.article_id=a.id) linked_to_issue FROM articles a JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id WHERE lower(ms.category)='online' AND a.published_at>=NOW()-INTERVAL '7 days' ${statusClause} ORDER BY a.published_at DESC NULLS LAST,a.id DESC LIMIT $1`,[q.data.limit])).rows;
    const rows:any[]=[];const seenBySource=new Map<string,string[]>();
    for(const row of raw){const key=String(row.source_id),seen=seenBySource.get(key)||[];if(duplicate(row.title,seen))continue;seen.push(row.title);seenBySource.set(key,seen);const audit=(await pool.query(`SELECT created_at,metadata->>'reason' reason,user_id FROM audit_logs WHERE action='ONLINE_ARTICLE_MARKED_IRRELEVANT' AND metadata->>'articleId'=$1 ORDER BY created_at DESC LIMIT 1`,[String(row.id)])).rows[0];row.relevance_status=audit?'irrelevant':'relevant';row.irrelevance_reason=audit?.reason??null;row.moderated_at=audit?.created_at??null;row.moderated_by=audit?.user_id??null;rows.push(row);}
    const stats=new Map<string,{source_id:any,name:string,stored_7d:number}>();for(const row of rows){const key=String(row.source_id),v=stats.get(key)||{source_id:row.source_id,name:row.source_name,stored_7d:0};v.stored_7d++;stats.set(key,v);}
    const allSources=(await pool.query(`SELECT id,name FROM media_sources WHERE lower(category)='online' ORDER BY name`)).rows;
    const sourceStats=allSources.map(s=>stats.get(String(s.id))||{source_id:s.id,name:s.name,stored_7d:0});
    return{data:rows,totalCount:rows.length,sourceStats,moderation:{canModerate:canModerate(request.onlineModerationAuth!)}};
  });

  app.post('/api/online/sources/:id/run',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineModerationAuth!;if(!canModerate(ctx))return reply.code(403).send({error:'ONLINE_INGESTION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_SOURCE_ID'});
    const source=(await pool.query(`SELECT id,name,url,tier,active,category FROM media_sources WHERE id=$1 AND active=true AND url IS NOT NULL AND lower(category)='online'`,[id.data])).rows[0];if(!source)return reply.code(404).send({error:'ONLINE_SOURCE_NOT_FOUND'});
    const checkedAt=new Date();
    try{
      const items=await collectOnlineSource({id:String(source.id),name:source.name,url:source.url,active:true});
      const existing=(await pool.query(`SELECT title FROM articles WHERE source_id=$1 AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '14 days'`,[source.id])).rows.map(r=>String(r.title||''));
      const accepted:any[]=[];const seen=[...existing];let duplicateSkipped=0;
      for(const item of items){if(duplicate(item.title,seen)){duplicateSkipped++;continue;}seen.push(item.title);accepted.push(item);}
      let inserted=0,analyzed=0,routed=0;const maxInsert=8,maxAnalyze=3;
      for(const item of accepted.slice(0,maxInsert)){
        const r=await pool.query(`INSERT INTO articles(source_id,title,url,published_at,content,summary,sentiment,importance_score) VALUES($1,$2,$3,$4,$5,$5,'neutral',0) ON CONFLICT(url) DO NOTHING RETURNING id`,[source.id,item.title,item.url,item.publishedAt,item.excerpt??null]);
        if(r.rowCount){
          inserted++;const articleId=String(r.rows[0].id);
          try{if(await routeArticleHeadline(pool,articleId))routed++;}catch{}
          if(analyzed<maxAnalyze){try{if(await analyzeArticle(pool,articleId))analyzed++;}catch{}}
        }
      }
      await pool.query(`UPDATE media_sources SET last_checked_at=$2,last_success_at=$2,last_error=NULL,last_fetched_count=$3,last_inserted_count=$4 WHERE id=$1`,[source.id,checkedAt,items.length,inserted]);
      return{source:source.name,sourceId:String(source.id),collector:'online-interactive-v6',fetched:items.length,duplicateSkipped,inserted,routed,analyzed,deferred:Math.max(0,accepted.length-maxInsert)};
    }catch(error){const message=error instanceof Error?error.message:String(error);await pool.query(`UPDATE media_sources SET last_checked_at=$2,last_error=$3 WHERE id=$1`,[source.id,checkedAt,message]).catch(()=>undefined);request.log.error({err:error,sourceId:source.id},'online source ingestion failed');return reply.code(502).send({error:'SOURCE_INGESTION_FAILED',message,source:source.name,sourceId:String(source.id)});}
  });

  app.post('/api/online/sources/:id/test',{preHandler:auth},async(request,reply)=>{
    const ctx=request.onlineModerationAuth!;if(!canModerate(ctx))return reply.code(403).send({error:'ONLINE_TEST_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_SOURCE_ID'});
    const source=(await pool.query(`SELECT id,name,url,active,category FROM media_sources WHERE id=$1 AND active=true AND url IS NOT NULL AND lower(category)='online'`,[id.data])).rows[0];if(!source)return reply.code(404).send({error:'ONLINE_SOURCE_NOT_FOUND'});
    const checkedAt=new Date();
    try{
      const probe=await probeUrl(healthTarget(source.url));
      if(!probe.ok)throw new Error(`HTTP ${probe.status}`);
      await pool.query(`UPDATE media_sources SET last_checked_at=$2,last_success_at=$2,last_error=NULL WHERE id=$1`,[source.id,checkedAt]);
      return{source:source.name,sourceId:String(source.id),ok:true,status:probe.status,finalUrl:probe.finalUrl,message:'Sumber dapat diakses'};
    }catch(error){const message=error instanceof Error?error.message:String(error);await pool.query(`UPDATE media_sources SET last_checked_at=$2,last_error=$3 WHERE id=$1`,[source.id,checkedAt,message]).catch(()=>undefined);request.log.warn({err:error,sourceId:source.id},'online source probe failed');return reply.code(502).send({error:'SOURCE_HEALTH_TEST_FAILED',message,source:source.name,sourceId:String(source.id)});}
  });

  app.post('/api/online/articles/:id/irrelevant',{preHandler:auth},async(request,reply)=>{const ctx=request.onlineModerationAuth!;if(!canModerate(ctx))return reply.code(403).send({error:'ONLINE_MODERATION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});const id=z.coerce.number().int().positive().safeParse((request.params as any).id);const body=z.object({reason:z.string().trim().min(3).max(500)}).safeParse(request.body);if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});const article=(await pool.query(`SELECT a.id,a.title,ms.name source_name FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1 AND lower(ms.category)='online'`,[id.data])).rows[0];if(!article)return reply.code(404).send({error:'ONLINE_ARTICLE_NOT_FOUND'});const linked=await pool.query(`SELECT issue_id FROM issue_articles WHERE article_id=$1 LIMIT 1`,[id.data]);if(linked.rowCount)return reply.code(409).send({error:'ARTICLE_ALREADY_LINKED_TO_ISSUE',issueId:linked.rows[0].issue_id});await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'ONLINE_ARTICLE_MARKED_IRRELEVANT',$2)`,[ctx.id,{articleId:String(id.data),title:article.title,sourceName:article.source_name,reason:body.data.reason}]);const orgId=await organizationId(pool,ctx);if(orgId)await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'UNIFIED_CANDIDATE_ISSUE_IGNORED',$2)`,[ctx.id,{organizationId:orgId,candidateKey:`online:${id.data}`,reason:body.data.reason,source:'online-moderation'}]);return{ok:true,data:{articleId:String(id.data),status:'irrelevant',reason:body.data.reason}};});
}
