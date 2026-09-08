import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

const ENGINE='phase2f-candidate-alert-v1.0';
declare module 'fastify' { interface FastifyRequest { phase2fCandidateAuth?: AuthorizationContext } }

type Candidate={engine:string;issueId:number;issueTitle:string;score:number;severity:'WATCH'|'ELEVATED'|'HIGH'|'CRITICAL';candidateAlert:boolean;linkedEvidenceCount:number;negativeCount:number;highRiskCount:number;criticalRiskCount:number;avgRisk:number;maxRisk:number;avgImportance:number;evidenceSourceCount:number;printArticleIds:number[];reasons:string[];note:string};
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const severity=(s:number):Candidate['severity']=>s>=85?'CRITICAL':s>=70?'HIGH':s>=50?'ELEVATED':'WATCH';

async function resolveOrganizationId(pool:Pool,ctx:AuthorizationContext){
 if(ctx.opdId){
  const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);
  const id=Number(r.rows[0]?.organization_id||0);
  if(id)return id;
 }
 const r=await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 2');
 return r.rowCount===1?Number(r.rows[0].id):0;
}

async function aggregate(pool:Pool,organizationId:number,limit:number):Promise<Candidate[]>{
 const issues=(await pool.query(`SELECT i.id,i.title FROM issues i WHERE i.organization_id=$1 AND lower(i.status) IN ('active','watch') ORDER BY i.updated_at DESC LIMIT $2`,[organizationId,limit])).rows;
 const out:Candidate[]=[];
 for(const issue of issues){
  const rows=(await pool.query(`SELECT pa.id,pa.sentiment,pa.risk_score,pa.importance_score,(SELECT count(*)::int FROM evidence_sources es WHERE es.print_article_id=pa.id) evidence_count FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked' AND lower(pa.status)='analyzed'`,[issue.id])).rows;
  if(!rows.length)continue;
  const n=rows.length,negative=rows.filter(r=>String(r.sentiment).toLowerCase()==='negative').length,high=rows.filter(r=>Number(r.risk_score)>=60).length,critical=rows.filter(r=>Number(r.risk_score)>=80).length;
  const avgRisk=rows.reduce((a,r)=>a+Number(r.risk_score||0),0)/n,maxRisk=Math.max(...rows.map(r=>Number(r.risk_score||0))),avgImportance=rows.reduce((a,r)=>a+Number(r.importance_score||0),0)/n,evidenceSourceCount=rows.reduce((a,r)=>a+Number(r.evidence_count||0),0);
  let score=avgRisk*.35+maxRisk*.25+avgImportance*.1;
  const reasons=[`Rata-rata risk ${Math.round(avgRisk)}/100`,`Risk tertinggi ${Math.round(maxRisk)}/100`,`Rata-rata importance ${Math.round(avgImportance)}/100`];
  if(n>=5){score+=20;reasons.push(`${n} clipping terkait: +20`)}else if(n>=3){score+=12;reasons.push(`${n} clipping terkait: +12`)}else if(n===2){score+=5;reasons.push('2 clipping terkait: +5')}
  if(negative>=3){score+=15;reasons.push(`${negative} clipping negatif: +15`)}else if(negative===2){score+=8;reasons.push('2 clipping negatif: +8')}
  if(high>=2){score+=15;reasons.push(`${high} clipping high/critical risk: +15`)}else if(high===1){score+=7;reasons.push('1 clipping high/critical risk: +7')}
  if(critical>=1){score+=10;reasons.push(`${critical} clipping critical risk: +10`)}
  const final=clamp(score);
  const corroborated=n>=2&&(negative>=2||high>=1||critical>=1);
  out.push({engine:ENGINE,issueId:Number(issue.id),issueTitle:String(issue.title),score:final,severity:severity(final),candidateAlert:corroborated&&final>=50,linkedEvidenceCount:n,negativeCount:negative,highRiskCount:high,criticalRiskCount:critical,avgRisk:Math.round(avgRisk),maxRisk:Math.round(maxRisk),avgImportance:Math.round(avgImportance),evidenceSourceCount,printArticleIds:rows.map(r=>Number(r.id)),reasons,note:corroborated&&final>=50?'Pola lintas evidence memenuhi ambang kandidat alert. Belum menjadi alert aktif; perlu validasi Humas/Super Admin.':'Belum ada pola risiko terkoroborasi yang cukup untuk kandidat alert.'});
 }
 return out.sort((a,b)=>Number(b.candidateAlert)-Number(a.candidateAlert)||b.score-a.score);
}

export async function registerPhase2fCandidateAlertRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.phase2fCandidateAuth=ctx}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'})}};
 app.get('/api/intelligence/candidate-alerts',{preHandler:auth},async(request,reply)=>{const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});const ctx=request.phase2fCandidateAuth!;const organizationId=await resolveOrganizationId(pool,ctx);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});if(!(hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all')||ctx.opdId))return reply.code(403).send({error:'FORBIDDEN'});const candidates=await aggregate(pool,organizationId,q.data.limit);return{data:{engine:ENGINE,total:candidates.length,candidateAlertCount:candidates.filter(x=>x.candidateAlert).length,candidates}}});
}
