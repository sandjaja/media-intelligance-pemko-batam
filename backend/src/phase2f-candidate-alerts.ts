import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

const ENGINE='unified-candidate-alert-v1.0-issue-risk';
declare module 'fastify' { interface FastifyRequest { phase2fCandidateAuth?: AuthorizationContext } }

type Severity='WATCH'|'ELEVATED'|'HIGH'|'CRITICAL';
type Candidate={
 engine:string;candidateKey:string;issueId:number;issueTitle:string;
 riskScore:number;riskLevel:string;severity:Severity;candidateAlert:boolean;
 validEvidence:number;negativeCount:number;negativePercent:number;
 velocityScore:number;recent24:number;previous24:number;
 sources:{online:number;print:number;social:number};sourceTypeCount:number;
 reasons:string[];note:string;measuredAt:string|null;
};

const severity=(risk:number):Severity=>risk>=80?'CRITICAL':risk>=60?'HIGH':risk>=35?'ELEVATED':'WATCH';

async function resolveOrganizationId(db:Pool|PoolClient,ctx:AuthorizationContext){
 if(ctx.opdId){
  const r=await db.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);
  const id=Number(r.rows[0]?.organization_id||0);if(id)return id;
 }
 const r=await db.query('SELECT id FROM organizations ORDER BY id LIMIT 2');
 return r.rowCount===1?Number(r.rows[0].id):0;
}

function evaluate(row:any):Candidate{
 const metadata=row.metadata||{},sources=metadata.sources||{},sentiment=metadata.sentiment||{},window=metadata.velocityWindow||{};
 const riskScore=Math.round(Number(row.risk_score||0));
 const riskLevel=String(row.risk_level||metadata.riskLevel||'low').toLowerCase();
 const velocityScore=Math.round(Number(row.velocity_score||metadata.components?.velocity||0));
 const validEvidence=Number(metadata.validEvidence||0);
 const negativeCount=Number(row.negative_count??sentiment.negative??0);
 const negativePercent=Number(sentiment.negativePercent??(validEvidence?Math.round(negativeCount/validEvidence*100):0));
 const normalizedSources={online:Number(sources.online||0),print:Number(sources.print||0),social:Number(sources.social||0)};
 const sourceTypeCount=Object.values(normalizedSources).filter(n=>n>0).length;
 const recent24=Number(window.recent24||0),previous24=Number(window.previous24||0);
 const accelerating=velocityScore>50&&recent24>previous24;
 const negativeDominant=negativePercent>=50;
 const multiSource=sourceTypeCount>=2;
 const critical=riskScore>=80;
 const highEscalating=riskScore>=60&&accelerating;
 const highNegative=riskScore>=60&&negativeDominant;
 const highMultiSource=riskScore>=60&&multiSource;
 const mediumFastNegative=riskScore>=35&&riskScore<60&&velocityScore>=70&&negativeDominant&&validEvidence>=2;
 const candidateAlert=Boolean(metadata.assessed)&&(critical||highEscalating||highNegative||highMultiSource||mediumFastNegative);
 const reasons:string[]=[];
 reasons.push(`Issue Risk ${riskScore}/100 (${riskLevel}) — menggunakan hasil mesin Issue Risk, tidak dihitung ulang oleh Early Warning.`);
 if(accelerating)reasons.push(`Pergerakan pemberitaan meningkat: ${recent24} evidence 24 jam terakhir vs ${previous24} pada 24 jam sebelumnya (velocity ${velocityScore}/100).`);
 if(negativeDominant)reasons.push(`Pemberitaan negatif dominan: ${negativePercent}% (${negativeCount}/${validEvidence} evidence valid).`);
 if(multiSource)reasons.push(`Isu terkoroborasi di ${sourceTypeCount} jenis media eksternal.`);
 if(mediumFastNegative)reasons.push('Risk masih medium, tetapi velocity sangat tinggi dan sentimen negatif dominan.');
 if(!candidateAlert)reasons.push('Belum memenuhi kombinasi kondisi Unified Early Warning.');
 return{
  engine:ENGINE,candidateKey:`issue:${Number(row.issue_id)}:metric:${Number(row.metric_id)}`,
  issueId:Number(row.issue_id),issueTitle:String(row.issue_title),riskScore,riskLevel,
  severity:severity(riskScore),candidateAlert,validEvidence,negativeCount,negativePercent,
  velocityScore,recent24,previous24,sources:normalizedSources,sourceTypeCount,reasons,
  note:candidateAlert?'Pola Issue Risk memenuhi kandidat Early Warning. Belum menjadi alert aktif; perlu validasi Humas/Super Admin.':'Belum memenuhi kondisi kandidat Early Warning.',
  measuredAt:row.measured_at?String(row.measured_at):null
 };
}

async function aggregate(db:Pool|PoolClient,organizationId:number,limit:number):Promise<Candidate[]>{
 const rows=(await db.query(`
  SELECT i.id issue_id,i.title issue_title,i.risk_level,
         im.id metric_id,im.risk_score,im.velocity_score,im.negative_count,im.metadata,im.measured_at
  FROM issues i
  JOIN LATERAL (
    SELECT m.* FROM issue_metrics m
    WHERE m.issue_id=i.id
    ORDER BY m.measured_at DESC,m.id DESC LIMIT 1
  ) im ON true
  WHERE i.organization_id=$1
    AND lower(i.status) IN ('active','watch')
    AND COALESCE((im.metadata->>'assessed')::boolean,false)=true
    AND COALESCE(im.metadata->>'engine','')='issue-risk-event-v2'
  ORDER BY im.risk_score DESC,im.velocity_score DESC,im.measured_at DESC
  LIMIT $2`,[organizationId,limit])).rows;
 return rows.map(evaluate).sort((a,b)=>Number(b.candidateAlert)-Number(a.candidateAlert)||b.riskScore-a.riskScore||b.velocityScore-a.velocityScore);
}

export async function registerPhase2fCandidateAlertRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{
  const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
  try{
   const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');
   const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
   request.phase2fCandidateAuth=ctx;
  }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
 };
 const canManage=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');

 app.get('/api/intelligence/candidate-alerts',{preHandler:auth},async(request,reply)=>{
  const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);
  if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
  const ctx=request.phase2fCandidateAuth!,organizationId=await resolveOrganizationId(pool,ctx);
  if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const canRead=canManage(ctx)||hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all')||Boolean(ctx.opdId);
  if(!canRead)return reply.code(403).send({error:'FORBIDDEN'});
  let candidates=await aggregate(pool,organizationId,q.data.limit);
  if(!canManage(ctx)&&ctx.opdId){
   const visible=(await pool.query(`SELECT DISTINCT issue_id FROM issue_opd WHERE opd_id=$1`,[ctx.opdId])).rows;
   const ids=new Set(visible.map((x:any)=>Number(x.issue_id)));candidates=candidates.filter(c=>ids.has(c.issueId));
  }
  const decisions=(await pool.query(`SELECT action,metadata FROM audit_logs
    WHERE action IN ('PHASE2F_CANDIDATE_ALERT_REJECTED','PHASE2F_CANDIDATE_ALERT_ACTIVATED')
      AND (metadata->>'organizationId')::bigint=$1 ORDER BY id DESC`,[organizationId])).rows;
  const decided=new Set(decisions.map((r:any)=>String(r.metadata?.candidateKey||'')));
  candidates=candidates.filter(c=>!decided.has(c.candidateKey));
  return{data:{engine:ENGINE,total:candidates.length,candidateAlertCount:candidates.filter(x=>x.candidateAlert).length,candidates}};
 });

 app.post('/api/intelligence/candidate-alerts/decision',{preHandler:auth},async(request,reply)=>{
  const ctx=request.phase2fCandidateAuth!;
  if(!canManage(ctx))return reply.code(403).send({error:'CANDIDATE_ALERT_DECISION_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
  const p=z.object({candidateKey:z.string().min(5).max(300),decision:z.enum(['activate','rejected']),reason:z.string().trim().min(3).max(500)}).safeParse(request.body);
  if(!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const organizationId=await resolveOrganizationId(client,ctx);
   if(!organizationId){await client.query('ROLLBACK');return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});}
   const candidates=await aggregate(client,organizationId,100),candidate=candidates.find(c=>c.candidateKey===p.data.candidateKey&&c.candidateAlert);
   if(!candidate){await client.query('ROLLBACK');return reply.code(409).send({error:'CANDIDATE_ALERT_NO_LONGER_VALID'});}
   const prior=await client.query(`SELECT 1 FROM audit_logs WHERE action IN ('PHASE2F_CANDIDATE_ALERT_REJECTED','PHASE2F_CANDIDATE_ALERT_ACTIVATED') AND metadata->>'candidateKey'=$1 LIMIT 1`,[candidate.candidateKey]);
   if(prior.rows[0]){await client.query('ROLLBACK');return reply.code(409).send({error:'CANDIDATE_ALERT_ALREADY_DECIDED'});}
   const auditMeta={organizationId,candidateKey:candidate.candidateKey,issueId:candidate.issueId,riskScore:candidate.riskScore,riskLevel:candidate.riskLevel,velocityScore:candidate.velocityScore,negativePercent:candidate.negativePercent,sources:candidate.sources,humanReason:p.data.reason,engine:ENGINE};
   if(p.data.decision==='rejected'){
    await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PHASE2F_CANDIDATE_ALERT_REJECTED',$2)`,[ctx.id,auditMeta]);
    await client.query('COMMIT');return{ok:true,decision:'rejected',candidateKey:candidate.candidateKey};
   }
   const opd=(await client.query(`SELECT opd_id FROM issue_opd WHERE issue_id=$1 ORDER BY CASE responsibility WHEN 'leading' THEN 0 ELSE 1 END,opd_id LIMIT 1`,[candidate.issueId])).rows[0]?.opd_id||null;
   const sev=candidate.riskScore>=80?'critical':candidate.riskScore>=60?'high':'medium';
   const alert=(await client.query(`INSERT INTO alerts(issue_id,opd_id,alert_type,severity,title,reason,status) VALUES($1,$2,'media_issue_early_warning',$3,$4,$5,'open') RETURNING id`,[candidate.issueId,opd,sev,`Early Warning: ${candidate.issueTitle}`,p.data.reason])).rows[0];
   const alertId=Number(alert.id);
   await client.query(`INSERT INTO alert_events(alert_id,event_type,payload,user_id) VALUES($1,'activated',$2,$3)`,[alertId,{...auditMeta,reasons:candidate.reasons},ctx.id]);
   await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PHASE2F_CANDIDATE_ALERT_ACTIVATED',$2)`,[ctx.id,{...auditMeta,alertId}]);
   await client.query('COMMIT');
   return{ok:true,decision:'activate',alertId,candidateKey:candidate.candidateKey};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
}
