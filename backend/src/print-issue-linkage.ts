import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printIssueAuth?: AuthorizationContext } }

type Phase2EAnalysisLike={issueCategory?:string;officialKeywordMatches?:Array<{keyword:string;opdId?:number|null}>;operatorKeywordMatches?:Array<{keyword:string}>;entityValidation?:{selected?:{opdId?:number|null;districtId?:number|null};detected?:{opd?:{id:number}|null;district?:{id:number}|null}}};};
export type IssueLinkageCandidate={issueId:number;title:string;status:string;score:number;confidence:'LOW'|'MEDIUM'|'HIGH';evidence:string[];linkageStatus:'candidate'|'linked';};
export type IssueLinkageResult={engine:string;generatedAt:string;candidateCount:number;linkedIssueId:number|null;candidates:IssueLinkageCandidate[];note:string;};

const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const stop=new Set(['dan','atau','yang','untuk','dengan','dari','pada','dalam','kota','batam','isu','umum','lintas']);
const terms=(v:any)=>norm(v).split(' ').filter((x:string)=>x.length>=4&&!stop.has(x));

export async function evaluatePrintIssueLinkage(client:PoolClient,article:any,analysis:Phase2EAnalysisLike):Promise<IssueLinkageResult>{
  const issues=(await client.query(`SELECT id,title,description,leading_opd_id,status,momentum,risk_score FROM issues WHERE status IN ('monitoring','developing','critical') ORDER BY last_seen_at DESC LIMIT 100`)).rows;
  const selectedOpd=analysis.entityValidation?.selected?.opdId??article.opd_id??null;
  const detectedOpd=analysis.entityValidation?.detected?.opd?.id??null;
  const keywordTerms=[...(analysis.officialKeywordMatches||[]).map(k=>({term:norm(k.keyword),weight:16,kind:'keyword resmi'})),...(analysis.operatorKeywordMatches||[]).map(k=>({term:norm(k.keyword),weight:8,kind:'keyword operator'}))].filter(k=>k.term.length>=3);
  const articleTitleTerms=new Set(terms(article.title));
  const categoryTerms=new Set(terms(analysis.issueCategory));
  const candidates:IssueLinkageCandidate[]=issues.map((i:any)=>{
    const hay=norm(`${i.title||''} ${i.description||''}`);let score=0;const evidence:string[]=[];let keywordHits=0;
    if(i.leading_opd_id!=null&&(Number(i.leading_opd_id)===Number(selectedOpd)||Number(i.leading_opd_id)===Number(detectedOpd))){score+=30;evidence.push('OPD utama issue sesuai OPD clipping');}
    for(const k of keywordTerms){if(hay.includes(k.term)){score+=k.weight;keywordHits++;evidence.push(`${k.kind} “${k.term}” cocok`);}}
    const issueTerms=new Set(terms(`${i.title||''} ${i.description||''}`));
    const titleOverlap=[...articleTitleTerms].filter(t=>issueTerms.has(t)).slice(0,4);if(titleOverlap.length){score+=Math.min(24,titleOverlap.length*6);evidence.push(`kemiripan judul: ${titleOverlap.join(', ')}`);}
    const categoryOverlap=[...categoryTerms].filter(t=>issueTerms.has(t)).slice(0,3);if(categoryOverlap.length){score+=Math.min(15,categoryOverlap.length*5);evidence.push(`kategori isu terkait: ${categoryOverlap.join(', ')}`);}
    score=Math.min(100,Math.round(score));const confidence:IssueLinkageCandidate['confidence']=score>=75?'HIGH':score>=45?'MEDIUM':'LOW';
    return{issueId:Number(i.id),title:String(i.title),status:String(i.status),score,confidence,evidence,linkageStatus:'candidate' as const};
  }).filter(c=>c.score>=20).sort((a,b)=>b.score-a.score).slice(0,5);

  const top=candidates[0];const second=candidates[1];const autoLink=Boolean(top&&top.score>=80&&(!second||top.score-second.score>=15));
  if(top&&autoLink)top.linkageStatus='linked';

  await client.query(`DELETE FROM issue_print_articles WHERE print_article_id=$1 AND decision_source='engine'`,[article.id]);
  for(const c of candidates){await client.query(`INSERT INTO issue_print_articles(issue_id,print_article_id,relevance_score,linkage_status,decision_source,evidence,updated_at) VALUES($1,$2,$3,$4,'engine',$5,now()) ON CONFLICT(issue_id,print_article_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,linkage_status=CASE WHEN issue_print_articles.decision_source='human' THEN issue_print_articles.linkage_status ELSE EXCLUDED.linkage_status END,decision_source=CASE WHEN issue_print_articles.decision_source='human' THEN 'human' ELSE 'engine' END,evidence=EXCLUDED.evidence,updated_at=now()`,[c.issueId,article.id,c.score,c.linkageStatus,JSON.stringify({confidence:c.confidence,evidence:c.evidence,engine:'phase2e-issue-link-v1'})]);}
  return{engine:'phase2e-issue-link-v1',generatedAt:new Date().toISOString(),candidateCount:candidates.length,linkedIssueId:autoLink&&top?top.issueId:null,candidates,note:'Hanya issue aktif yang sudah ada yang dievaluasi. Sistem tidak membuat issue baru otomatis. Kandidat dengan keyakinan sedang/rendah menunggu keputusan Humas/Super Admin.'};
}

export async function registerPrintIssueLinkageRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const decoded=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof decoded.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,decoded.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.printIssueAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
  const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
  app.get('/api/print/articles/:id/issue-linkage',{preHandler:auth},async(request,reply)=>{const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});return{data:(await pool.query(`SELECT ipa.issue_id,i.title,i.status issue_status,ipa.relevance_score,ipa.linkage_status,ipa.decision_source,ipa.evidence,ipa.decided_at FROM issue_print_articles ipa JOIN issues i ON i.id=ipa.issue_id WHERE ipa.print_article_id=$1 ORDER BY CASE ipa.linkage_status WHEN 'linked' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END,ipa.relevance_score DESC`,[id.data])).rows};});
  app.post('/api/print/articles/:id/issue-linkage/:issueId/decision',{preHandler:auth},async(request,reply)=>{const ctx=request.printIssueAuth!;if(!canManage(ctx))return reply.code(403).send({error:'ISSUE_LINK_DECISION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});const p=z.object({id:z.coerce.number().int().positive(),issueId:z.coerce.number().int().positive()}).safeParse(request.params);const b=z.object({decision:z.enum(['linked','rejected']),reason:z.string().trim().min(3).max(500)}).safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_DECISION'});const client=await pool.connect();try{await client.query('BEGIN');const existing=(await client.query(`SELECT 1 FROM issue_print_articles WHERE print_article_id=$1 AND issue_id=$2 FOR UPDATE`,[p.data.id,p.data.issueId])).rowCount;if(!existing){await client.query('ROLLBACK');return reply.code(404).send({error:'ISSUE_LINK_CANDIDATE_NOT_FOUND'});}if(b.data.decision==='linked')await client.query(`UPDATE issue_print_articles SET linkage_status='rejected',decision_source='human',decided_by=$2,decided_at=now(),updated_at=now() WHERE print_article_id=$1 AND issue_id<>$3 AND linkage_status='linked'`,[p.data.id,ctx.id,p.data.issueId]);const row=(await client.query(`UPDATE issue_print_articles SET linkage_status=$3,decision_source='human',decided_by=$4,decided_at=now(),updated_at=now(),evidence=COALESCE(evidence,'{}'::jsonb)||$5::jsonb WHERE print_article_id=$1 AND issue_id=$2 RETURNING *`,[p.data.id,p.data.issueId,b.data.decision,ctx.id,JSON.stringify({humanReason:b.data.reason})])).rows[0];await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_ISSUE_LINK_DECISION',$2)`,[ctx.id,{printArticleId:p.data.id,issueId:p.data.issueId,decision:b.data.decision,reason:b.data.reason}]);await client.query('COMMIT');return{data:row};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}});
}
