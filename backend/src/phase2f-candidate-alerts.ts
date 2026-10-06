import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { safeEnqueueNotificationForEarlyWarningAlert } from './notification-core.js';
import { dispatchPendingNotifications } from './notification-dispatcher.js';

const ENGINE='unified-candidate-alert-v1.0-issue-risk';
declare module 'fastify' { interface FastifyRequest { phase2fCandidateAuth?: AuthorizationContext } }

type Severity='WATCH'|'ELEVATED'|'HIGH'|'CRITICAL';
type Candidate={
 engine:string;candidateKey:string;issueId:number;issueTitle:string;issueStatus:string;
 openCycle:boolean;workflowId:number|null;workflowStatus:string|null;cycleNumber:number|null;
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
  issueId:Number(row.issue_id),issueTitle:String(row.issue_title),issueStatus:String(row.issue_status||'').toLowerCase(),
  openCycle:Boolean(row.workflow_id&&String(row.workflow_status||'').toUpperCase()!=='CLOSED'),workflowId:row.workflow_id?Number(row.workflow_id):null,
  workflowStatus:row.workflow_status?String(row.workflow_status):null,cycleNumber:row.cycle_number==null?null:Number(row.cycle_number),riskScore,riskLevel,
  severity:severity(riskScore),candidateAlert,validEvidence,negativeCount,negativePercent,
  velocityScore,recent24,previous24,sources:normalizedSources,sourceTypeCount,reasons,
  note:candidateAlert?'Pola Issue Risk memenuhi kandidat Early Warning. Belum menjadi alert aktif; perlu validasi Humas/Super Admin.':'Belum memenuhi kondisi kandidat Early Warning.',
  measuredAt:row.measured_at?String(row.measured_at):null
 };
}

async function aggregate(db:Pool|PoolClient,organizationId:number,limit:number):Promise<Candidate[]>{
 const rows=(await db.query(`
  SELECT i.id issue_id,i.title issue_title,i.status issue_status,i.risk_level,
         w.id workflow_id,w.workflow_status,w.cycle_number,
         im.id metric_id,im.risk_score,im.velocity_score,im.negative_count,im.metadata,im.measured_at
  FROM issues i
  JOIN LATERAL (
    SELECT m.* FROM issue_metrics m
    WHERE m.issue_id=i.id
    ORDER BY m.measured_at DESC,m.id DESC LIMIT 1
  ) im ON true
  LEFT JOIN LATERAL (
    SELECT wx.id,wx.workflow_status,wx.cycle_number FROM issue_workflows wx
    WHERE wx.issue_id=i.id ORDER BY wx.cycle_number DESC,wx.id DESC LIMIT 1
  ) w ON true
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
 const canDecideCandidate=(ctx:AuthorizationContext)=>canManage(ctx)||ctx.roles.includes('executive');

 app.get('/api/intelligence/candidate-alerts',{preHandler:auth},async(request,reply)=>{
  const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);
  if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
  const ctx=request.phase2fCandidateAuth!,organizationId=await resolveOrganizationId(pool,ctx);
  if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const canRead=canManage(ctx)||ctx.roles.includes('executive')||hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all')||Boolean(ctx.opdId)||Boolean(ctx.districtId);
  if(!canRead)return reply.code(403).send({error:'FORBIDDEN'});
  let candidates=await aggregate(pool,organizationId,q.data.limit);
  if(!canManage(ctx)&&ctx.opdId){
   const visible=(await pool.query(`SELECT DISTINCT issue_id FROM issue_opd WHERE opd_id=$1`,[ctx.opdId])).rows;
   const ids=new Set(visible.map((x:any)=>Number(x.issue_id)));candidates=candidates.filter(c=>ids.has(c.issueId));
  }else if(!canManage(ctx)&&ctx.districtId){
   const visible=(await pool.query(`SELECT i.id issue_id FROM issues i WHERE i.organization_id=$1 AND (i.geographic_scope='CITYWIDE' OR EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$2))`,[organizationId,ctx.districtId])).rows;
   const ids=new Set(visible.map((x:any)=>Number(x.issue_id)));candidates=candidates.filter(c=>ids.has(c.issueId));
  }
  const decisions=(await pool.query(`SELECT action,metadata FROM audit_logs
    WHERE action IN ('PHASE2F_CANDIDATE_ALERT_REJECTED','PHASE2F_CANDIDATE_ALERT_ACTIVATED')
      AND (metadata->>'organizationId')::bigint=$1 ORDER BY id DESC`,[organizationId])).rows;
  const decided=new Set(decisions.map((r:any)=>String(r.metadata?.candidateKey||'')));
  const activeAlertIssues=new Set((await pool.query(`SELECT DISTINCT a.issue_id FROM alerts a JOIN issues i ON i.id=a.issue_id WHERE i.organization_id=$1 AND a.alert_type='media_issue_early_warning' AND a.status IN ('open','acknowledged')`,[organizationId])).rows.map((x:any)=>Number(x.issue_id)));
  candidates=candidates.filter(c=>!decided.has(c.candidateKey)&&!activeAlertIssues.has(c.issueId));
  return{data:{engine:ENGINE,total:candidates.length,candidateAlertCount:candidates.filter(x=>x.candidateAlert).length,candidates}};
 });

 app.get('/api/intelligence/alerts',{preHandler:auth},async(request,reply)=>{
  const q=z.object({status:z.enum(['active','open','acknowledged','resolved']).default('open'),limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(request.query);
  if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
  const ctx=request.phase2fCandidateAuth!,organizationId=await resolveOrganizationId(pool,ctx);
  if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const activeStatus=q.data.status==='active';
  const params:any[]=activeStatus?[organizationId]:[organizationId,q.data.status];let scope='';
  if(!canManage(ctx)&&ctx.opdId){params.push(ctx.opdId);scope=` AND EXISTS(SELECT 1 FROM issue_opd io WHERE io.issue_id=a.issue_id AND io.opd_id=${params.length})`;}
  else if(!canManage(ctx)&&ctx.districtId){params.push(ctx.districtId);scope=` AND (i.geographic_scope='CITYWIDE' OR EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=${params.length}))`;}
  else if(!canManage(ctx)&&!ctx.roles.includes('executive')&&!hasPermission(ctx,'intelligence.read.all'))return reply.code(403).send({error:'FORBIDDEN'});
  params.push(q.data.limit);
  const rows=(await pool.query(`SELECT a.id,a.issue_id,a.opd_id,a.alert_type,a.severity,a.title,a.reason,a.status,a.created_at,a.acknowledged_at,a.resolved_at,
    i.title issue_title,i.status issue_status,i.risk_level,i.momentum,o.name opd_name,
    w.id workflow_id,w.workflow_status,w.cycle_number,
    (SELECT im.risk_score FROM issue_metrics im WHERE im.issue_id=i.id ORDER BY im.measured_at DESC,im.id DESC LIMIT 1) risk_score,
    (SELECT im.velocity_score FROM issue_metrics im WHERE im.issue_id=i.id ORDER BY im.measured_at DESC,im.id DESC LIMIT 1) velocity_score
    FROM alerts a JOIN issues i ON i.id=a.issue_id LEFT JOIN opd o ON o.id=a.opd_id
    LEFT JOIN LATERAL (
      SELECT wx.id,wx.workflow_status,wx.cycle_number FROM issue_workflows wx
      WHERE wx.issue_id=i.id ORDER BY wx.cycle_number DESC,wx.id DESC LIMIT 1
    ) w ON true
    WHERE i.organization_id=$1 AND ${activeStatus?"a.status IN ('open','acknowledged')":'a.status=$2'} AND a.alert_type='media_issue_early_warning'${scope}
    ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,a.created_at DESC LIMIT ${params.length}`,params)).rows;
  return{data:{engine:ENGINE,status:q.data.status,total:rows.length,alerts:rows}};
 });

 app.patch('/api/intelligence/alerts/:id',{preHandler:auth},async(request,reply)=>{
  const ctx=request.phase2fCandidateAuth!;if(!canManage(ctx))return reply.code(403).send({error:'ALERT_UPDATE_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
  const id=z.coerce.number().int().positive().safeParse((request.params as any).id);
  const body=z.object({status:z.enum(['acknowledged','resolved']),reason:z.string().trim().min(3).max(500)}).safeParse(request.body);
  if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  const organizationId=await resolveOrganizationId(pool,ctx);
  const row=(await pool.query(`SELECT a.id,a.status FROM alerts a JOIN issues i ON i.id=a.issue_id WHERE a.id=$1 AND i.organization_id=$2 AND a.alert_type='media_issue_early_warning' LIMIT 1`,[id.data,organizationId])).rows[0];
  if(!row)return reply.code(404).send({error:'ALERT_NOT_FOUND'});
  if(row.status==='resolved')return reply.code(409).send({error:'ALERT_ALREADY_RESOLVED'});
  await pool.query(`UPDATE alerts SET status=$2,acknowledged_at=CASE WHEN $2='acknowledged' THEN COALESCE(acknowledged_at,NOW()) ELSE acknowledged_at END,resolved_at=CASE WHEN $2='resolved' THEN NOW() ELSE resolved_at END WHERE id=$1`,[id.data,body.data.status]);
  await pool.query(`INSERT INTO alert_events(alert_id,event_type,payload) VALUES($1,$2,$3)`,[id.data,body.data.status,{reason:body.data.reason,previousStatus:row.status,engine:ENGINE,actorUserId:ctx.id}]);
  return{ok:true,id:id.data,status:body.data.status};
 });

 app.post('/api/intelligence/candidate-alerts/decision',{preHandler:auth},async(request,reply)=>{
  const ctx=request.phase2fCandidateAuth!;
  if(!canDecideCandidate(ctx))return reply.code(403).send({error:'CANDIDATE_ALERT_DECISION_REQUIRES_HUMAS_EXECUTIVE_OR_SUPER_ADMIN'});
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
   if(p.data.decision==='activate'){
    await client.query('SELECT pg_advisory_xact_lock($1)',[candidate.issueId]);
    const existing=(await client.query(`SELECT id,status FROM alerts WHERE issue_id=$1 AND alert_type='media_issue_early_warning' AND status IN ('open','acknowledged') ORDER BY id DESC LIMIT 1`,[candidate.issueId])).rows[0];
    if(existing){await client.query('ROLLBACK');return reply.code(409).send({error:'EARLY_WARNING_ALREADY_ACTIVE',alertId:Number(existing.id),status:existing.status});}
   }
   const auditMeta={organizationId,candidateKey:candidate.candidateKey,issueId:candidate.issueId,riskScore:candidate.riskScore,riskLevel:candidate.riskLevel,velocityScore:candidate.velocityScore,negativePercent:candidate.negativePercent,sources:candidate.sources,humanReason:p.data.reason,engine:ENGINE};
   if(p.data.decision==='rejected'){
    await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PHASE2F_CANDIDATE_ALERT_REJECTED',$2)`,[ctx.id,auditMeta]);
    await client.query('COMMIT');return{ok:true,decision:'rejected',candidateKey:candidate.candidateKey};
   }
   const opd=(await client.query(`SELECT opd_id FROM issue_opd WHERE issue_id=$1 ORDER BY CASE responsibility WHEN 'leading' THEN 0 ELSE 1 END,opd_id LIMIT 1`,[candidate.issueId])).rows[0]?.opd_id||null;
   const sev=candidate.riskScore>=80?'critical':candidate.riskScore>=60?'high':'medium';
   const alert=(await client.query(`INSERT INTO alerts(issue_id,opd_id,alert_type,severity,title,reason,status) VALUES($1,$2,'media_issue_early_warning',$3,$4,$5,'open') RETURNING id`,[candidate.issueId,opd,sev,`Early Warning: ${candidate.issueTitle}`,p.data.reason])).rows[0];
   const alertId=Number(alert.id);
   await client.query(`INSERT INTO alert_events(alert_id,event_type,payload) VALUES($1,'activated',$2)`,[alertId,{...auditMeta,reasons:candidate.reasons,actorUserId:ctx.id}]);
   await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PHASE2F_CANDIDATE_ALERT_ACTIVATED',$2)`,[ctx.id,{...auditMeta,alertId}]);
   await client.query('COMMIT');
   const notification=await safeEnqueueNotificationForEarlyWarningAlert(pool,alertId,ctx.id,app.log);
   if(notification.queued>0){
    try{await dispatchPendingNotifications(pool);}catch(error){app.log.error({error,alertId},'early warning notification dispatch failed');}
   }
   return{ok:true,decision:'activate',alertId,candidateKey:candidate.candidateKey,notification};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 });
}
