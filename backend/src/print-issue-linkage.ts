import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printIssueAuth?: AuthorizationContext } }

type Phase2EAnalysisLike = {
  issueCategory?: string;
  officialKeywordMatches?: Array<{ keyword: string; opdId?: number | null }>;
  operatorKeywordMatches?: Array<{ keyword: string }>;
  entityValidation?: { selected?: { opdId?: number | null; districtId?: number | null }; detected?: { opd?: { id: number } | null; district?: { id: number } | null } };
};

export type IssueLinkageCandidate = { issueId:number; title:string; status:string; score:number; confidence:'LOW'|'MEDIUM'|'HIGH'; evidence:string[]; linkageStatus:'candidate'|'linked'|'rejected' };
export type IssueLinkageResult = { engine:string; generatedAt:string; candidateCount:number; linkedIssueId:number|null; candidates:IssueLinkageCandidate[]; note:string; degraded?:boolean };

const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>new Set(norm(v).split(' ').filter(x=>x.length>=4 && !['yang','dengan','untuk','dari','pada','dalam','pemko','batam','pemerintah','dinas'].includes(x)));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(x=>b.has(x));
const confidence=(score:number):'LOW'|'MEDIUM'|'HIGH'=>score>=70?'HIGH':score>=40?'MEDIUM':'LOW';

async function compute(client:PoolClient, article:any, analysis:Phase2EAnalysisLike):Promise<IssueLinkageResult>{
  const org=await client.query(`SELECT pe.organization_id FROM print_editions pe WHERE pe.id=$1 LIMIT 1`,[article.edition_id]);
  if(!org.rows[0]) return {engine:'phase2e-issue-link-v2-deterministic',generatedAt:new Date().toISOString(),candidateCount:0,linkedIssueId:null,candidates:[],degraded:true,note:'Organization clipping tidak ditemukan.'};
  const issues=await client.query(`SELECT i.id,i.title,i.description,i.status,COALESCE(array_agg(DISTINCT io.opd_id) FILTER (WHERE io.opd_id IS NOT NULL),'{}') AS opd_ids FROM issues i LEFT JOIN issue_opd io ON io.issue_id=i.id WHERE i.organization_id=$1 AND i.status IN ('active','watch') GROUP BY i.id ORDER BY i.updated_at DESC LIMIT 100`,[org.rows[0].organization_id]);
  const articleWords=tokens(`${article.title||''} ${article.summary||''} ${article.body_text||''}`);
  const articleKeywords=new Set([...(analysis.officialKeywordMatches||[]),...(analysis.operatorKeywordMatches||[])].map(x=>norm(x.keyword)).filter(Boolean));
  const selectedOpd=Number(analysis.entityValidation?.selected?.opdId||article.opd_id||0)||null;
  const selectedDistrict=Number(analysis.entityValidation?.selected?.districtId||article.district_id||0)||null;
  const category=norm(analysis.issueCategory);
  const candidates:IssueLinkageCandidate[]=[];
  for(const issue of issues.rows){
    let score=0; const evidence:string[]=[];
    const issueText=norm(`${issue.title||''} ${issue.description||''}`); const issueWords=tokens(issueText);
    const shared=overlap(articleWords,issueWords);
    const sharedKw=[...articleKeywords].filter(k=>k.length>=3 && issueText.includes(k));
    if(category && issueText.includes(category)){score+=25;evidence.push(`Taxonomy sama/tercantum: ${analysis.issueCategory}`);}
    if(selectedOpd && (issue.opd_ids||[]).map(Number).includes(selectedOpd)){score+=20;evidence.push('OPD sama');}
    if(sharedKw.length){const s=Math.min(30,sharedKw.length*10);score+=s;evidence.push(`Keyword sama: ${sharedKw.slice(0,4).join(', ')}`);}
    if(shared.length){const s=Math.min(25,shared.length*5);score+=s;evidence.push(`Topik/judul serupa: ${shared.slice(0,5).join(', ')}`);}
    if(selectedDistrict && issueText.includes(String(selectedDistrict))){score+=10;evidence.push('Wilayah sama');}
    score=Math.min(100,score);
    if(score>=40)candidates.push({issueId:Number(issue.id),title:issue.title,status:issue.status,score,confidence:confidence(score),evidence,linkageStatus:'candidate'});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const top=candidates.slice(0,3);
  return {engine:'phase2e-issue-link-v2-deterministic',generatedAt:new Date().toISOString(),candidateCount:top.length,linkedIssueId:null,candidates:top,note:top.length?'Kandidat berbasis evidence. Keputusan akhir tetap Humas/Super Admin.':'Belum ada issue aktif/watch yang cukup relevan. Sistem tidak membuat issue baru otomatis.'};
}

export async function evaluatePrintIssueLinkage(client:PoolClient,article:any,analysis:Phase2EAnalysisLike):Promise<IssueLinkageResult>{
  try{return await compute(client,article,analysis);}catch(e){console.error('print issue linkage degraded',e);return {engine:'phase2e-issue-link-v2-deterministic',generatedAt:new Date().toISOString(),candidateCount:0,linkedIssueId:null,candidates:[],degraded:true,note:'Issue linkage gagal dihitung tetapi tidak memblokir proses analisis utama.'};}
}

export async function registerPrintIssueLinkageRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const decoded=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof decoded.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,decoded.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.printIssueAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
 const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
 app.get('/api/print/articles/:id/issue-linkage',{preHandler:auth},async(request,reply)=>{const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});const client=await pool.connect();try{const ar=await client.query(`SELECT * FROM print_articles WHERE id=$1`,[id.data]);if(!ar.rows[0])return reply.code(404).send({error:'NOT_FOUND'});const analysis=(ar.rows[0].ai_metadata?.phase2e||{}) as Phase2EAnalysisLike;const result=await compute(client,ar.rows[0],analysis);const saved=await client.query(`SELECT issue_id,relevance_score,linkage_status,evidence,decided_at FROM issue_print_articles WHERE print_article_id=$1`,[id.data]);const byIssue=new Map(saved.rows.map(x=>[Number(x.issue_id),x]));result.candidates=result.candidates.map(c=>{const s=byIssue.get(c.issueId);return s?{...c,score:Number(s.relevance_score)||c.score,linkageStatus:s.linkage_status,evidence:Array.isArray(s.evidence?.reasons)?s.evidence.reasons:c.evidence}:c;});const linked=saved.rows.find(x=>x.linkage_status==='linked');result.linkedIssueId=linked?Number(linked.issue_id):null;return {data:result};}finally{client.release();}});
 app.post('/api/print/articles/:id/issue-linkage/:issueId/decision',{preHandler:auth},async(request,reply)=>{const ctx=request.printIssueAuth!;if(!canManage(ctx))return reply.code(403).send({error:'ISSUE_LINK_DECISION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});const p=z.object({decision:z.enum(['linked','rejected']),score:z.coerce.number().min(0).max(100),evidence:z.array(z.string()).max(20).default([])}).safeParse(request.body);const ids=z.object({id:z.coerce.number().int().positive(),issueId:z.coerce.number().int().positive()}).safeParse(request.params);if(!p.success||!ids.success)return reply.code(400).send({error:'INVALID_REQUEST'});const client=await pool.connect();try{await client.query('BEGIN');const valid=await client.query(`SELECT i.id FROM issues i JOIN print_articles pa ON pa.id=$1 JOIN print_editions pe ON pe.id=pa.edition_id WHERE i.id=$2 AND i.organization_id=pe.organization_id AND i.status IN ('active','watch')`,[ids.data.id,ids.data.issueId]);if(!valid.rows[0]){await client.query('ROLLBACK');return reply.code(404).send({error:'ISSUE_NOT_ACTIVE_OR_NOT_FOUND'});}if(p.data.decision==='linked')await client.query(`UPDATE issue_print_articles SET linkage_status='rejected',decided_by=$2,decided_at=now(),updated_at=now() WHERE print_article_id=$1 AND linkage_status='linked' AND issue_id<>$3`,[ids.data.id,ctx.id,ids.data.issueId]);await client.query(`INSERT INTO issue_print_articles(issue_id,print_article_id,relevance_score,linkage_status,decided_by,decided_at,evidence) VALUES($1,$2,$3,$4,$5,now(),$6) ON CONFLICT(issue_id,print_article_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,linkage_status=EXCLUDED.linkage_status,decided_by=EXCLUDED.decided_by,decided_at=now(),evidence=EXCLUDED.evidence,updated_at=now()`,[ids.data.issueId,ids.data.id,p.data.score,p.data.decision,ctx.id,{engine:'phase2e-issue-link-v2-deterministic',reasons:p.data.evidence}]);await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ISSUE_LINK_DECISION',$2)`,[ctx.id,{printArticleId:ids.data.id,issueId:ids.data.issueId,decision:p.data.decision,score:p.data.score,evidence:p.data.evidence}]);await client.query('COMMIT');return {ok:true,decision:p.data.decision};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}});
}
