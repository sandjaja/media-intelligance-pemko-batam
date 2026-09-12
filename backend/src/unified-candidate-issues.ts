import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

const ENGINE='unified-candidate-issue-v1.0-print-online';
declare module 'fastify' { interface FastifyRequest { unifiedIssueAuth?: AuthorizationContext } }

const STOP=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','batam','pemerintah','dinas','kota','daerah','berita','halaman','koran','media','kepri','provinsi','tahun','akan','telah','jadi','atau','oleh','para','terkait','program','kegiatan']);
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&/[a-z]/.test(x)&&!STOP.has(x)))];
const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
const riskLevel=(score:number)=>score>=80?'critical':score>=60?'high':score>=35?'medium':'low';
const momentum=(count:number,importance:number)=>count>=4||importance>=75?'high':count>=2||importance>=45?'medium':'low';

async function resolveOrganizationId(db:Pool|PoolClient,ctx:AuthorizationContext){
  if(ctx.opdId){const r=await db.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);const id=Number(r.rows[0]?.organization_id||0);if(id)return id;}
  const r=await db.query('SELECT id FROM organizations ORDER BY id LIMIT 2');
  return r.rowCount===1?Number(r.rows[0].id):0;
}

async function ignoredKeys(db:Pool|PoolClient,organizationId:number){
  const r=await db.query(`SELECT metadata->>'candidateKey' candidate_key FROM audit_logs WHERE action='UNIFIED_CANDIDATE_ISSUE_IGNORED' AND (metadata->>'organizationId')::bigint=$1`,[organizationId]);
  return new Set(r.rows.map(x=>String(x.candidate_key||'')).filter(Boolean));
}

function quality(title:string,summary:string,importance:number,risk:number,category:string|null){
  const ts=tokens(`${title} ${summary}`);let score=25;
  if(title.trim().length>=20)score+=10;
  if(ts.length>=3)score+=15;else if(ts.length>=2)score+=8;
  if(category)score+=10;
  if(importance>=40)score+=15;else if(importance>=30)score+=8;
  if(risk>=35)score+=15;else if(risk>=20)score+=8;
  if(/defisit|korupsi|banjir|genangan|macet|kebakaran|krisis|keluhan|protes|investasi|apbd|pad|inflasi|pengangguran|sampah|limbah|kecelakaan/i.test(`${title} ${summary}`))score+=10;
  return Math.min(100,score);
}

function issueSimilarity(e:any,i:any){
  const a=new Set(tokens(`${e.title} ${e.summary||''} ${e.category||''}`));
  const b=new Set(tokens(`${i.title} ${i.description||''}`));
  const shared=[...a].filter(x=>b.has(x));let score=Math.min(70,shared.length*18);
  if(e.opdId&&Array.isArray(i.opdIds)&&i.opdIds.map(Number).includes(Number(e.opdId)))score+=15;
  return Math.min(100,score);
}

async function detect(db:Pool|PoolClient,organizationId:number){
  const ignored=await ignoredKeys(db,organizationId);
  const print=(await db.query(`SELECT pa.id,'print' source_type,pa.title,pa.summary,pa.body_text content,pa.sentiment,COALESCE(pa.risk_score,0)::float risk_score,COALESCE(pa.importance_score,0)::float importance_score,pa.opd_id,pa.district_id,pa.ai_metadata->'phase2e'->>'issueCategory' category,pe.edition_date occurred_at,o.name opd_name FROM print_articles pa JOIN opd o ON o.id=pa.opd_id LEFT JOIN print_editions pe ON pe.id=pa.edition_id WHERE o.organization_id=$1 AND lower(pa.status)='analyzed' AND NOT EXISTS(SELECT 1 FROM issue_print_articles ipa WHERE ipa.print_article_id=pa.id AND ipa.linkage_status='linked') ORDER BY pa.created_at DESC LIMIT 100`,[organizationId])).rows;
  const online=(await db.query(`SELECT a.id,'online' source_type,a.title,a.summary,a.content,a.sentiment,COALESCE(a.risk_score,0)::float risk_score,COALESCE(a.importance_score,0)::float importance_score,a.opd_id,a.district_id,NULL::text category,a.published_at occurred_at,o.name opd_name FROM articles a LEFT JOIN opd o ON o.id=a.opd_id WHERE (o.organization_id=$1 OR (a.opd_id IS NULL AND (SELECT count(*) FROM organizations)=1)) AND NOT EXISTS(SELECT 1 FROM issue_articles ia WHERE ia.article_id=a.id) ORDER BY COALESCE(a.published_at,a.created_at) DESC LIMIT 100`,[organizationId])).rows;
  const issues=(await db.query(`SELECT i.id,i.title,i.description,COALESCE(array_agg(DISTINCT io.opd_id) FILTER(WHERE io.opd_id IS NOT NULL),'{}') opd_ids FROM issues i LEFT JOIN issue_opd io ON io.issue_id=i.id WHERE i.organization_id=$1 AND i.status IN ('active','watch') GROUP BY i.id ORDER BY i.updated_at DESC`,[organizationId])).rows;
  const evidence=[...print,...online].map((r:any)=>({sourceType:r.source_type,id:Number(r.id),title:String(r.title||'').trim(),summary:String(r.summary||r.content||'').slice(0,1500),sentiment:r.sentiment||null,riskScore:Number(r.risk_score||0),importanceScore:Number(r.importance_score||0),opdId:r.opd_id==null?null:Number(r.opd_id),opdName:r.opd_name||null,districtId:r.district_id==null?null:Number(r.district_id),category:r.category||null,occurredAt:r.occurred_at||null}));
  const candidates:any[]=[];
  for(const e of evidence){
    const score=quality(e.title,e.summary,e.importanceScore,e.riskScore,e.category);if(score<60)continue;
    const key=`${e.sourceType}:${e.id}`;if(ignored.has(key))continue;
    const matches=issues.map((i:any)=>({issueId:Number(i.id),title:i.title,score:issueSimilarity(e,i)})).filter((x:any)=>x.score>=30).sort((a:any,b:any)=>b.score-a.score).slice(0,3);
    candidates.push({engine:ENGINE,candidateKey:key,score,suggestedTitle:e.category||e.title.slice(0,180),suggestedDescription:`Kandidat issue dari ${e.sourceType}. ${e.title}`,sourceTypes:[e.sourceType],evidence:[e],evidenceCount:1,opdId:e.opdId,opdName:e.opdName,riskLevel:riskLevel(e.riskScore),momentum:momentum(1,e.importanceScore),existingIssueMatches:matches,reasons:[e.category?`Taxonomy: ${e.category}`:null,`Importance ${e.importanceScore}/100`,`Risk ${e.riskScore}/100`,matches[0]?`Kemungkinan terkait issue #${matches[0].issueId} (${matches[0].score}%)`:null].filter(Boolean)});
  }
  return candidates.sort((a,b)=>b.score-a.score||b.evidence[0].importanceScore-a.evidence[0].importanceScore).slice(0,50);
}

async function linkEvidence(client:PoolClient,issueId:number,c:any,ctx:AuthorizationContext,reason:string){
  for(const e of c.evidence){
    if(e.sourceType==='print')await client.query(`INSERT INTO issue_print_articles(issue_id,print_article_id,relevance_score,linkage_status,decided_by,decided_at,evidence) VALUES($1,$2,$3,'linked',$4,now(),$5) ON CONFLICT(issue_id,print_article_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,linkage_status='linked',decided_by=EXCLUDED.decided_by,decided_at=now(),evidence=EXCLUDED.evidence,updated_at=now()`,[issueId,e.id,c.score,ctx.id,{engine:ENGINE,candidateKey:c.candidateKey,humanReason:reason}]);
    if(e.sourceType==='online')await client.query(`INSERT INTO issue_articles(issue_id,article_id,relevance_score) VALUES($1,$2,$3) ON CONFLICT(issue_id,article_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score`,[issueId,e.id,c.score]);
  }
}

export async function registerUnifiedCandidateIssueRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.unifiedIssueAuth=ctx}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'})}};
  app.get('/api/intelligence/unified-candidate-issues',{preHandler:auth},async(request,reply)=>{const ctx=request.unifiedIssueAuth!;const organizationId=await resolveOrganizationId(pool,ctx);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const candidates=await detect(pool,organizationId);return{data:{engine:ENGINE,total:candidates.length,candidates}}});
  app.post('/api/intelligence/unified-candidate-issues/decision',{preHandler:auth},async(request,reply)=>{
    const ctx=request.unifiedIssueAuth!;if(!canManage(ctx))return reply.code(403).send({error:'CANDIDATE_ISSUE_DECISION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const p=z.object({candidateKey:z.string().min(3).max(200),decision:z.enum(['create','merge','ignore']),reason:z.string().trim().min(3).max(1000),title:z.string().trim().min(3).max(250).optional(),targetIssueId:z.coerce.number().int().positive().optional()}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const client=await pool.connect();try{await client.query('BEGIN');const organizationId=await resolveOrganizationId(client,ctx);if(!organizationId){await client.query('ROLLBACK');return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'})}const c=(await detect(client,organizationId)).find(x=>x.candidateKey===p.data.candidateKey);if(!c){await client.query('ROLLBACK');return reply.code(409).send({error:'CANDIDATE_NOT_AVAILABLE'})}
      if(p.data.decision==='ignore'){await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'UNIFIED_CANDIDATE_ISSUE_IGNORED',$2)`,[ctx.id,{organizationId,candidateKey:c.candidateKey,reason:p.data.reason,engine:ENGINE,evidence:c.evidence}]);await client.query('COMMIT');return{ok:true,decision:'ignore',candidateKey:c.candidateKey}}
      let issueId:number;
      if(p.data.decision==='merge'){
        if(!p.data.targetIssueId){await client.query('ROLLBACK');return reply.code(400).send({error:'TARGET_ISSUE_REQUIRED'})}
        const target=await client.query(`SELECT id FROM issues WHERE id=$1 AND organization_id=$2 AND status IN ('active','watch')`,[p.data.targetIssueId,organizationId]);if(!target.rows[0]){await client.query('ROLLBACK');return reply.code(404).send({error:'TARGET_ISSUE_NOT_FOUND'})}issueId=Number(target.rows[0].id);
      }else{
        const slug=c.candidateKey.replace(/[^a-z0-9]+/gi,'-').toLowerCase();const issueKey=`uci-${slug}`;
        const created=await client.query(`INSERT INTO issues(organization_id,issue_key,title,description,status,risk_level,momentum,first_seen_at,last_seen_at) VALUES($1,$2,$3,$4,'watch',$5,$6,COALESCE($7::timestamptz,now()),COALESCE($7::timestamptz,now())) ON CONFLICT(issue_key) DO UPDATE SET updated_at=now() RETURNING id`,[organizationId,issueKey,p.data.title||c.suggestedTitle,c.suggestedDescription,c.riskLevel,c.momentum,c.evidence[0]?.occurredAt||null]);issueId=Number(created.rows[0].id);
      }
      if(c.opdId)await client.query(`INSERT INTO issue_opd(issue_id,opd_id,responsibility) VALUES($1,$2,'leading') ON CONFLICT(issue_id,opd_id) DO UPDATE SET responsibility='leading'`,[issueId,c.opdId]);
      await linkEvidence(client,issueId,c,ctx,p.data.reason);
      await client.query(`INSERT INTO issue_workflows(issue_id,workflow_status) VALUES($1,'NEW') ON CONFLICT(issue_id) DO NOTHING`,[issueId]);
      await client.query(`UPDATE issues SET last_seen_at=GREATEST(last_seen_at,COALESCE($2::timestamptz,last_seen_at)),updated_at=now() WHERE id=$1`,[issueId,c.evidence[0]?.occurredAt||null]);
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,$2,$3)`,[ctx.id,p.data.decision==='merge'?'UNIFIED_CANDIDATE_ISSUE_MERGED':'UNIFIED_CANDIDATE_ISSUE_CREATED',{organizationId,issueId,candidateKey:c.candidateKey,reason:p.data.reason,engine:ENGINE,evidence:c.evidence}]);
      await client.query('COMMIT');return{ok:true,decision:p.data.decision,issueId,candidateKey:c.candidateKey};
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  });
}
