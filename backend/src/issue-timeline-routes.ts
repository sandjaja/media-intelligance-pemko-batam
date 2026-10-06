import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { issueTimelineAuth?: AuthorizationContext } }

type TimelineEvent={
 id:string;occurredAt:string;phase:string;eventType:string;cycleNumber:number|null;
 title:string;description:string|null;actor:{userId:number|null;role:string|null}|null;
 source:{type:string;id:string|number|null};metadata:Record<string,unknown>;
};

const iso=(v:any)=>v?new Date(v).toISOString():null;
const push=(events:TimelineEvent[],e:Omit<TimelineEvent,'occurredAt'>&{occurredAt:any})=>{
 const occurredAt=iso(e.occurredAt);if(occurredAt)events.push({...e,occurredAt});
};
async function organizationId(pool:Pool,ctx:AuthorizationContext){
 if(ctx.opdId){const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);if(r.rows[0]?.organization_id)return Number(r.rows[0].organization_id);}
 const r=await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2');return r.rowCount===1?Number(r.rows[0].id):0;
}
const broadRead=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.some(r=>['super_admin','humas','executive'].includes(r));

export async function registerIssueTimelineRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{
  const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
  try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.issueTimelineAuth=ctx;}
  catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
 };

 app.get('/api/intelligence/issues/:id/timeline',{preHandler:auth},async(request,reply)=>{
  const p=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ID'});
  const ctx=request.issueTimelineAuth!,orgId=await organizationId(pool,ctx);if(!orgId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const issue=(await pool.query(`SELECT id,title,status,created_at,updated_at,geographic_scope FROM issues WHERE id=$1 AND organization_id=$2 LIMIT 1`,[p.data.id,orgId])).rows[0];
  if(!issue)return reply.code(404).send({error:'ISSUE_NOT_FOUND'});
  if(!broadRead(ctx)){
   if(ctx.opdId){const ok=(await pool.query('SELECT 1 FROM issue_opd WHERE issue_id=$1 AND opd_id=$2 LIMIT 1',[p.data.id,ctx.opdId])).rows[0];if(!ok)return reply.code(403).send({error:'ISSUE_TIMELINE_FORBIDDEN'});}
   else if(ctx.districtId){const ok=issue.geographic_scope==='CITYWIDE'||Boolean((await pool.query('SELECT 1 FROM issue_districts WHERE issue_id=$1 AND district_id=$2 LIMIT 1',[p.data.id,ctx.districtId])).rows[0]);if(!ok)return reply.code(403).send({error:'ISSUE_TIMELINE_FORBIDDEN'});}
   else return reply.code(403).send({error:'ISSUE_TIMELINE_FORBIDDEN'});
  }

  const events:TimelineEvent[]=[];
  const evidence=(await pool.query(`
   SELECT 'online' source_type,COUNT(*)::int count,MIN(COALESCE(a.published_at,ia.created_at)) first_at,MAX(COALESCE(a.published_at,ia.created_at)) last_at
   FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=$1
   UNION ALL
   SELECT 'print',COUNT(*)::int,MIN(COALESCE(pe.edition_date::timestamptz,ipa.created_at)),MAX(COALESCE(pe.edition_date::timestamptz,ipa.created_at))
   FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id LEFT JOIN print_editions pe ON pe.id=pa.edition_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked'
   UNION ALL
   SELECT CASE WHEN sm.source_kind='owned' THEN 'owned' ELSE 'social' END,COUNT(*)::int,MIN(COALESCE(sm.published_at,sm.captured_at,smi.created_at)),MAX(COALESCE(sm.published_at,sm.captured_at,smi.created_at))
   FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id WHERE smi.issue_id=$1 GROUP BY CASE WHEN sm.source_kind='owned' THEN 'owned' ELSE 'social' END
  `,[p.data.id])).rows.filter((x:any)=>Number(x.count)>0);
  const evidenceCount=evidence.reduce((n:number,x:any)=>n+Number(x.count),0),firstEvidence=evidence.map((x:any)=>x.first_at).filter(Boolean).sort()[0]||null;
  if(firstEvidence)push(events,{id:`evidence:first:${p.data.id}`,occurredAt:firstEvidence,phase:'EVIDENCE',eventType:'EVIDENCE_FIRST_DETECTED',cycleNumber:null,title:'Evidence pertama terdeteksi',description:`${evidenceCount} evidence terhubung dari ${evidence.length} jenis media.`,actor:null,source:{type:'issue_evidence',id:p.data.id},metadata:{counts:Object.fromEntries(evidence.map((x:any)=>[x.source_type,Number(x.count)])),lastAt:evidence.map((x:any)=>iso(x.last_at)).filter(Boolean).sort().at(-1)||null}});

  const candidates=(await pool.query(`SELECT id,status,suggested_title,first_detected_at,last_detected_at,decided_at,decided_by,decision_reason FROM unified_candidate_issues WHERE organization_id=$1 AND issue_id=$2 ORDER BY first_detected_at,id`,[orgId,p.data.id])).rows;
  for(const c of candidates){
   push(events,{id:`candidate:${c.id}:detected`,occurredAt:c.first_detected_at,phase:'CANDIDATE',eventType:'CANDIDATE_DETECTED',cycleNumber:null,title:'Candidate Issue terbentuk',description:c.suggested_title||null,actor:null,source:{type:'unified_candidate_issue',id:Number(c.id)},metadata:{status:c.status}});
   if(c.decided_at)push(events,{id:`candidate:${c.id}:decided`,occurredAt:c.decided_at,phase:'CANDIDATE',eventType:`CANDIDATE_${String(c.status).toUpperCase()}`,cycleNumber:null,title:c.status==='APPROVED'?'Candidate disetujui menjadi Issue':'Keputusan Candidate Issue',description:c.decision_reason||null,actor:{userId:c.decided_by?Number(c.decided_by):null,role:null},source:{type:'unified_candidate_issue',id:Number(c.id)},metadata:{status:c.status}});
  }

  const transitions=(await pool.query(`SELECT id,user_id,metadata,created_at FROM audit_logs WHERE action='ISSUE_MANAGEMENT_UPDATED' AND metadata->>'issueId'=$1 ORDER BY created_at,id`,[String(p.data.id)])).rows;
  const hasInitialWatch=transitions.some((x:any)=>String(x.metadata?.statusTransition?.to||'').toLowerCase()==='watch');
  if(!hasInitialWatch)push(events,{id:`issue:${p.data.id}:watch`,occurredAt:issue.created_at,phase:'WATCH',eventType:'ISSUE_WATCH',cycleNumber:null,title:'Issue masuk WATCH',description:'Issue mulai dipantau.',actor:null,source:{type:'issue',id:p.data.id},metadata:{}});
  for(const t of transitions){const st=t.metadata?.statusTransition;if(!st?.to)continue;const to=String(st.to).toUpperCase();if(to==='ACTIVE')continue;push(events,{id:`audit:${t.id}`,occurredAt:t.created_at,phase:to,eventType:`ISSUE_${to}`,cycleNumber:null,title:to==='WATCH'?'Issue dibuka kembali ke WATCH':to==='RESOLVED'?'Issue diselesaikan':to==='ARCHIVED'?'Issue diarsipkan':`Status Issue menjadi ${to}`,description:st.reason||null,actor:{userId:t.user_id?Number(t.user_id):null,role:null},source:{type:'audit_log',id:Number(t.id)},metadata:{from:st.from||null,to:st.to}});}

  const alerts=(await pool.query(`SELECT a.id,a.severity,a.status,a.created_at,a.acknowledged_at,a.resolved_at,ae.id event_id,ae.event_type,ae.payload,ae.created_at event_at FROM alerts a LEFT JOIN alert_events ae ON ae.alert_id=a.id WHERE a.issue_id=$1 AND a.alert_type='media_issue_early_warning' ORDER BY a.created_at,ae.created_at,ae.id`,[p.data.id])).rows;
  const seenAlerts=new Set<number>();
  for(const a of alerts){const aid=Number(a.id);if(!seenAlerts.has(aid)){seenAlerts.add(aid);push(events,{id:`alert:${aid}`,occurredAt:a.created_at,phase:'EARLY_WARNING',eventType:'EARLY_WARNING_ACTIVATED',cycleNumber:a.payload?.cycleNumber==null?null:Number(a.payload.cycleNumber),title:'Early Warning diaktifkan',description:a.payload?.humanReason||null,actor:a.payload?.actorUserId?{userId:Number(a.payload.actorUserId),role:null}:null,source:{type:'alert',id:aid},metadata:{severity:a.severity,status:a.status}});}if(a.event_id&&String(a.event_type)!=='activated')push(events,{id:`alert-event:${a.event_id}`,occurredAt:a.event_at,phase:'EARLY_WARNING',eventType:`EARLY_WARNING_${String(a.event_type).toUpperCase()}`,cycleNumber:a.payload?.cycleNumber==null?null:Number(a.payload.cycleNumber),title:`Early Warning ${String(a.event_type).toLowerCase()}`,description:a.payload?.reason||null,actor:a.payload?.actorUserId?{userId:Number(a.payload.actorUserId),role:null}:null,source:{type:'alert_event',id:Number(a.event_id)},metadata:{}});}

  const wfEvents=(await pool.query(`SELECT e.id,e.workflow_id,w.cycle_number,e.actor_user_id,e.actor_role,e.event_type,e.from_status,e.to_status,e.note,e.metadata,e.created_at FROM issue_workflow_events e JOIN issue_workflows w ON w.id=e.workflow_id WHERE e.issue_id=$1 ORDER BY e.created_at,e.id`,[p.data.id])).rows;
  for(const e of wfEvents)push(events,{id:`workflow-event:${e.id}`,occurredAt:e.created_at,phase:e.event_type==='ISSUE_ACTIVATED'?'ACTIVE':'KLARIFIKASI',eventType:e.event_type,cycleNumber:Number(e.cycle_number),title:e.event_type==='ISSUE_ACTIVATED'?'Issue diaktifkan':String(e.event_type).replaceAll('_',' '),description:e.note||null,actor:{userId:e.actor_user_id?Number(e.actor_user_id):null,role:e.actor_role||null},source:{type:'issue_workflow_event',id:Number(e.id)},metadata:{fromStatus:e.from_status||null,toStatus:e.to_status||null}});

  const gaps=(await pool.query(`SELECT g.id,g.workflow_id,w.cycle_number,g.analyzed_at,g.analyzed_by FROM issue_communication_gap_snapshots g JOIN issue_workflows w ON w.id=g.workflow_id WHERE g.issue_id=$1 ORDER BY g.analyzed_at,g.id`,[p.data.id])).rows;
  for(const g of gaps)push(events,{id:`gap:${g.id}`,occurredAt:g.analyzed_at,phase:'GAP',eventType:'COMMUNICATION_GAP_ANALYZED',cycleNumber:Number(g.cycle_number),title:'Analisis Gap selesai',description:null,actor:{userId:g.analyzed_by?Number(g.analyzed_by):null,role:null},source:{type:'communication_gap_snapshot',id:Number(g.id)},metadata:{}});

  const strategies=(await pool.query(`SELECT s.id,s.workflow_id,w.cycle_number,s.version,s.status,s.generated_at,s.approved_at,s.generated_by,s.approved_by FROM communication_strategies s JOIN issue_workflows w ON w.id=s.workflow_id WHERE s.issue_id=$1 ORDER BY COALESCE(s.generated_at,s.created_at),s.id`,[p.data.id])).rows;
  for(const s of strategies){if(s.generated_at)push(events,{id:`strategy:${s.id}:generated`,occurredAt:s.generated_at,phase:'STRAKOM',eventType:'STRATEGY_GENERATED',cycleNumber:Number(s.cycle_number),title:`Strakom v${s.version} dibuat`,description:null,actor:{userId:s.generated_by?Number(s.generated_by):null,role:null},source:{type:'communication_strategy',id:Number(s.id)},metadata:{status:s.status,version:Number(s.version)}});if(s.approved_at)push(events,{id:`strategy:${s.id}:approved`,occurredAt:s.approved_at,phase:'STRAKOM',eventType:'STRATEGY_APPROVED',cycleNumber:Number(s.cycle_number),title:`Strakom v${s.version} disetujui`,description:null,actor:{userId:s.approved_by?Number(s.approved_by):null,role:null},source:{type:'communication_strategy',id:Number(s.id)},metadata:{version:Number(s.version)}});}

  const pubs=(await pool.query(`SELECT p.id,p.workflow_id,w.cycle_number,p.evidence_type,p.channel,p.created_by,p.created_at FROM issue_publication_evidence p JOIN issue_workflows w ON w.id=p.workflow_id WHERE p.issue_id=$1 ORDER BY p.created_at,p.id`,[p.data.id])).rows;
  for(const x of pubs)push(events,{id:`publication:${x.id}`,occurredAt:x.created_at,phase:'PUBLIKASI',eventType:'PUBLICATION_EVIDENCE_ADDED',cycleNumber:Number(x.cycle_number),title:'Bukti publikasi ditambahkan',description:x.channel||x.evidence_type,actor:{userId:x.created_by?Number(x.created_by):null,role:null},source:{type:'publication_evidence',id:Number(x.id)},metadata:{evidenceType:x.evidence_type,channel:x.channel||null}});

  const monitoring=(await pool.query(`SELECT m.id,m.workflow_id,w.cycle_number,m.period_number,m.analyzed_at,m.period_started_at,m.period_ended_at FROM issue_monitoring_analysis_snapshots m JOIN issue_workflows w ON w.id=m.workflow_id WHERE m.issue_id=$1 ORDER BY m.analyzed_at,m.id`,[p.data.id])).rows;
  for(const m of monitoring)push(events,{id:`monitoring:${m.id}`,occurredAt:m.analyzed_at,phase:'MONITORING',eventType:'MONITORING_ANALYZED',cycleNumber:Number(m.cycle_number),title:`Analisis Monitoring #${m.period_number}`,description:null,actor:null,source:{type:'monitoring_snapshot',id:Number(m.id)},metadata:{periodNumber:Number(m.period_number),periodStartedAt:iso(m.period_started_at),periodEndedAt:iso(m.period_ended_at)}});

  const rawCycles=(await pool.query(`SELECT id,cycle_number,workflow_status,created_at,assigned_at,approved_at,published_at,closed_at FROM issue_workflows WHERE issue_id=$1 ORDER BY cycle_number`,[p.data.id])).rows;
  const cycles=rawCycles.filter((w:any)=>String(w.workflow_status)!=='NEW'||wfEvents.some((e:any)=>Number(e.workflow_id)===Number(w.id))||gaps.some((g:any)=>Number(g.workflow_id)===Number(w.id))||strategies.some((s:any)=>Number(s.workflow_id)===Number(w.id))||pubs.some((x:any)=>Number(x.workflow_id)===Number(w.id))||monitoring.some((m:any)=>Number(m.workflow_id)===Number(w.id))).map((w:any)=>({id:Number(w.id),cycleNumber:Number(w.cycle_number),status:w.workflow_status,createdAt:iso(w.created_at),assignedAt:iso(w.assigned_at),approvedAt:iso(w.approved_at),publishedAt:iso(w.published_at),closedAt:iso(w.closed_at)}));
  for(const w of cycles){const hasActive=events.some(e=>e.cycleNumber===w.cycleNumber&&e.eventType==='ISSUE_ACTIVATED');if(!hasActive&&w.status!=='NEW')push(events,{id:`workflow:${w.id}:active-fallback`,occurredAt:w.createdAt,phase:'ACTIVE',eventType:'ISSUE_ACTIVATED',cycleNumber:w.cycleNumber,title:'Issue diaktifkan',description:'Awal siklus komunikasi (rekonstruksi dari workflow historis).',actor:null,source:{type:'issue_workflow',id:w.id},metadata:{reconstructed:true}});}
  events.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)||a.id.localeCompare(b.id));
  return{data:{issue:{id:Number(issue.id),title:issue.title,status:issue.status},summary:{eventCount:events.length,evidenceCount,cycleCount:cycles.length},cycles,events,readOnly:true}};
 });
}
