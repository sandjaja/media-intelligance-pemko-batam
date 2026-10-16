import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { loadHumasAiTask, executeHumasAi } from './ai-humas-execution.js';
import { withHumasAnalysisLock } from './ai-humas-analysis-lock.js';
import { knowledgeEvaluationSchema, summarizeKnowledgeSources, type KnowledgeEvaluation } from './knowledge-evaluation.js';

declare module 'fastify' { interface FastifyRequest { knowledgeAuth?: AuthorizationContext } }
// Closed cycles retain their original routing in the Gap snapshot, even without clarification.
const cycleOpdJoin=`LEFT JOIN opd o ON o.organization_id=i.organization_id AND o.id=COALESCE(w.lead_opd_id,
 (SELECT so.id FROM issue_communication_gap_snapshots gs JOIN opd so
   ON so.id::text=COALESCE(gs.result->'data',gs.result)#>>'{issueContext,opds,primary,id}'
   AND so.organization_id=i.organization_id WHERE gs.workflow_id=w.id ORDER BY gs.id DESC LIMIT 1),
 (SELECT ro.id FROM issue_keywords ik JOIN keyword_opd ko ON ko.keyword_id=ik.keyword_id
   AND ko.active=TRUE AND ko.routing_role='PRIMARY' JOIN opd ro ON ro.id=ko.opd_id
   AND ro.organization_id=i.organization_id WHERE ik.issue_id=i.id AND ik.keyword_role='PRIMARY'
   ORDER BY ko.weight DESC,ro.id LIMIT 1))`;
const eventTypes=['KNOWLEDGE_EVALUATION_DRAFTED','KNOWLEDGE_EVALUATION_APPROVED'];
const manager=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.some(r=>['super_admin','humas'].includes(r));
const globalReader=(ctx:AuthorizationContext)=>manager(ctx)||ctx.roles.includes('executive');
const versionSchema=z.string().regex(/^\d+$/).nullable();
const idSchema=z.object({id:z.string().regex(/^[1-9]\d*$/)});
const evaluationEvent=(row:any)=>row?{version:String(row.id),status:row.event_type===eventTypes[1]?'APPROVED':'DRAFT',evaluation:row.metadata.evaluation,ai:row.metadata.ai||null,metrics:row.metadata.metrics,sourceRefs:row.metadata.sourceRefs,updatedAt:row.created_at,reviewedBy:row.event_type===eventTypes[1]?row.actor_user_id:null}:null;

export async function registerKnowledgeEvaluationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{
  try{
   const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
   const decoded=jwt.verify(token,jwtSecret);if(typeof decoded==='string'||typeof decoded.sub!=='string')throw Error('INVALID_TOKEN');
   const ctx=await loadAuthorizationContext(pool,decoded.sub);
   if(!ctx?.active)return reply.code(401).send({error:'ACCOUNT_INACTIVE'});
   if(!globalReader(ctx)&&!ctx.roles.some(r=>['opd','district'].includes(r)))return reply.code(403).send({error:'FORBIDDEN'});
   request.knowledgeAuth=ctx;
  }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
 };
 const scope=async(ctx:AuthorizationContext)=>{
  let organizationId:number|null=null;
  if(ctx.opdId){const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);organizationId=r.rows[0]?.organization_id||null;}
  if(!organizationId){const r=await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2');if(r.rows.length===1)organizationId=Number(r.rows[0].id);}
  if(!organizationId)throw Error('ORGANIZATION_UNRESOLVED');
  const params:any[]=[organizationId];let sql='i.organization_id=$1';
  if(!globalReader(ctx)){
   if(ctx.roles.includes('opd')&&ctx.opdId){params.push(ctx.opdId);sql+=` AND (w.lead_opd_id=$2 OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=$2))`;}
   else if(ctx.roles.includes('district')&&ctx.districtId){params.push(ctx.districtId);sql+=` AND (i.geographic_scope='CITYWIDE' OR EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$2) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='DISTRICT' AND c.district_id=$2))`;}
   else sql+=' AND FALSE';
  }
  return {sql,params};
 };
 const cycle=async(ctx:AuthorizationContext,id:string,db:Pool|PoolClient=pool,lock=false)=>{
  const s=await scope(ctx);s.params.push(id);
  return (await db.query(`SELECT w.*,i.title AS issue_title,i.organization_id,i.geographic_scope,o.name AS lead_opd_name
    FROM issue_workflows w JOIN issues i ON i.id=w.issue_id ${cycleOpdJoin}
    WHERE ${s.sql} AND w.id=$${s.params.length} AND w.workflow_status='CLOSED' ${lock?'FOR UPDATE OF w':''}`,s.params)).rows[0]||null;
 };
 const latest=async(id:string,db:Pool|PoolClient=pool,approvedOnly=false)=>(await db.query(`SELECT id,event_type,metadata,created_at,actor_user_id FROM issue_workflow_events
  WHERE workflow_id=$1 AND event_type=ANY($2::text[]) ${approvedOnly?"AND event_type='KNOWLEDGE_EVALUATION_APPROVED'":''}
  ORDER BY id DESC LIMIT 1`,[id,eventTypes])).rows[0]||null;
 const sources=async(w:any)=>{
  const [gap,strategy,publication,monitoring,response,keywords,districts]=await Promise.all([
   pool.query('SELECT id,result,analyzed_at FROM issue_communication_gap_snapshots WHERE workflow_id=$1',[w.id]),
   pool.query("SELECT id,version,executive_summary,key_messages,communication_objectives,channel_strategy,approved_at FROM communication_strategies WHERE workflow_id=$1 AND status IN ('APPROVED','SUPERSEDED') ORDER BY version DESC LIMIT 1",[w.id]),
   pool.query('SELECT id,result,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[w.id]),
   pool.query('SELECT id,period_number,result,evidence_summary,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 ORDER BY period_number DESC,id DESC LIMIT 1',[w.id]),
   pool.query("SELECT id,version,key_message,reviewed_at AS approved_at FROM issue_response_submissions WHERE workflow_id=$1 AND status='APPROVED' ORDER BY version DESC LIMIT 1",[w.id]),
   pool.query('SELECT k.id,k.keyword,ik.keyword_role FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=$1 ORDER BY ik.keyword_role,k.keyword',[w.issue_id]),
   pool.query('SELECT d.id,d.name FROM issue_districts x JOIN districts d ON d.id=x.district_id WHERE x.issue_id=$1 ORDER BY d.name',[w.issue_id]),
  ]);
  const gd=gap.rows[0]?.result?.data||gap.rows[0]?.result||{},mon=monitoring.rows[0];
  return {workflow:w,keywords:keywords.rows,districts:districts.rows,
   gap:gap.rows[0]?{id:gap.rows[0].id,analyzedAt:gap.rows[0].analyzed_at,status:gd.semanticAssessment?.status||gd.baselineStatus,claims:(gd.externalAngles?.claims||gd.externalAngles?.angles||[]).map((a:any)=>a.claim||a.label),coverage:gd.semanticAssessment?.coverage||[],geographicAnalysis:gd.geographicAnalysis||gd.externalAngles?.geographicAnalysis||null}:null,
   strategy:strategy.rows[0]||null,response:response.rows[0]||null,
   publication:publication.rows[0]?{id:publication.rows[0].id,analyzedAt:publication.rows[0].analyzed_at,analysis:publication.rows[0].result}:null,
   monitoring:mon?{id:mon.id,period:mon.period_number,analyzedAt:mon.analyzed_at,evidence:mon.evidence_summary||mon.result?.evidence||{},assessment:mon.result?.analysis?.focusAssessment||null}:null};
 };
 async function save(ctx:AuthorizationContext,id:string,expectedVersion:string|null,evaluation:KnowledgeEvaluation,approve=false,ai?:any){
  const initial=await cycle(ctx,id);if(!initial)throw Error('KNOWLEDGE_CYCLE_NOT_FOUND');
  const source=approve?null:await sources(initial);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const w=await cycle(ctx,id,client,true);if(!w)throw Error('KNOWLEDGE_CYCLE_NOT_FOUND');
   const prior=await latest(id,client);
   if((prior?String(prior.id):null)!==expectedVersion)throw Error('KNOWLEDGE_VERSION_CONFLICT');
   if(!approve&&prior?.event_type===eventTypes[1])throw Error('KNOWLEDGE_APPROVED_LOCKED');
   if(approve&&(!prior||prior.event_type!==eventTypes[0]))throw Error('KNOWLEDGE_DRAFT_REQUIRED');
   if(approve&&(evaluation.summary.length<20||!evaluation.lessons.length))throw Error('KNOWLEDGE_REVIEW_INCOMPLETE');
   if(!approve&&prior?.event_type===eventTypes[0]&&JSON.stringify(prior.metadata.evaluation)===JSON.stringify(evaluation)&&!ai)throw Error('KNOWLEDGE_NO_CHANGES');
   const metrics=approve?prior.metadata.metrics:summarizeKnowledgeSources(source).metrics;
   const sourceRefs=approve?prior.metadata.sourceRefs:{gapId:source?.gap?.id||null,strategyId:source?.strategy?.id||null,publicationId:source?.publication?.id||null,monitoringId:source?.monitoring?.id||null};
   const metadata={formatVersion:1,evaluation,metrics,sourceRefs,ai:ai||prior?.metadata?.ai||null};
   const result=(await client.query(`INSERT INTO issue_workflow_events(workflow_id,issue_id,actor_user_id,actor_role,event_type,from_status,to_status,note,metadata)
    VALUES($1,$2,$3,$4,$5,'CLOSED','CLOSED',$6,$7::jsonb) RETURNING id,event_type,metadata,created_at,actor_user_id`,
    [w.id,w.issue_id,ctx.id,ctx.roles.includes('humas')?'humas':'super_admin',approve?eventTypes[1]:eventTypes[0],approve?'Evaluasi disetujui Humas untuk pustaka pembelajaran':'Draft evaluasi siklus',JSON.stringify(metadata)])).rows[0];
   await client.query('COMMIT');return evaluationEvent(result);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 const fail=(reply:any,error:any)=>{
  const code=String(error?.message||'');
  const status=code==='KNOWLEDGE_CYCLE_NOT_FOUND'?404:code.startsWith('KNOWLEDGE_')||code==='AI_ANALYSIS_ALREADY_RUNNING'?409:503;
  return reply.code(status).send({error:/^(KNOWLEDGE_|AI_)[A-Z0-9_]+$/.test(code)?code:'KNOWLEDGE_UNAVAILABLE'});
 };
 app.get('/api/knowledge/cycles',{preHandler:auth},async(request,reply)=>{
  const q=z.object({view:z.enum(['evaluations','library']).default('evaluations'),q:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(20).default(5)}).safeParse(request.query);
  if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
  try{
   const ctx=request.knowledgeAuth!,s=await scope(ctx);const approved=q.data.view==='library'||!manager(ctx);
   let where=`${s.sql} AND w.workflow_status='CLOSED'`;
   if(q.data.view==='library')where+=' AND e.id IS NOT NULL';
   if(q.data.q){s.params.push('%'+q.data.q.replace(/[\\%_]/g,'\\$&')+'%');const n=s.params.length;where+=` AND (i.title ILIKE $${n} OR o.name ILIKE $${n} OR e.metadata->'evaluation'->>'summary' ILIKE $${n} OR (e.metadata->'evaluation'->'lessons')::text ILIKE $${n} OR (e.metadata->'evaluation'->'tags')::text ILIKE $${n} OR EXISTS(SELECT 1 FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=i.id AND k.keyword ILIKE $${n}))`;}
   const from=`FROM issue_workflows w JOIN issues i ON i.id=w.issue_id ${cycleOpdJoin}
     LEFT JOIN LATERAL(SELECT ke.* FROM issue_workflow_events ke WHERE ke.workflow_id=w.id AND ke.event_type=ANY(ARRAY['KNOWLEDGE_EVALUATION_DRAFTED','KNOWLEDGE_EVALUATION_APPROVED']) ${approved?"AND ke.event_type='KNOWLEDGE_EVALUATION_APPROVED'":''} ORDER BY ke.id DESC LIMIT 1)e ON true WHERE ${where}`;
   const count=await pool.query(`SELECT COUNT(*)::int AS total ${from}`,s.params);
   const params=[...s.params,q.data.limit,(q.data.page-1)*q.data.limit];
   const data=await pool.query(`SELECT w.id AS workflow_id,w.issue_id,w.cycle_number,w.closed_at,i.title AS issue_title,o.name AS lead_opd_name,
      e.id AS evaluation_version,e.event_type,e.metadata,e.created_at AS evaluated_at ${from}
      ORDER BY w.closed_at DESC NULLS LAST,w.id DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
   return {data:data.rows.map(r=>({workflowId:String(r.workflow_id),issueId:String(r.issue_id),cycleNumber:r.cycle_number,closedAt:r.closed_at,title:r.issue_title,leadOpd:r.lead_opd_name,
    evaluation:r.evaluation_version?{version:String(r.evaluation_version),status:r.event_type===eventTypes[1]?'APPROVED':'DRAFT',...r.metadata.evaluation,metrics:r.metadata.metrics,updatedAt:r.evaluated_at}:null})),total:Number(count.rows[0]?.total||0),page:q.data.page,limit:q.data.limit,canManage:manager(ctx)};
  }catch(error){return fail(reply,error);}
 });
 app.get('/api/knowledge/cycles/:id',{preHandler:auth},async(request,reply)=>{
  const id=idSchema.safeParse(request.params);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});
  try{
   const library=(request.query as any)?.view==='library';
   const ctx=request.knowledgeAuth!,w=await cycle(ctx,id.data.id);if(!w)return reply.code(404).send({error:'KNOWLEDGE_CYCLE_NOT_FOUND'});
   const source=await sources(w),evaluation=await latest(id.data.id,pool,library||!manager(ctx));
   return {data:{source,...summarizeKnowledgeSources(source),saved:evaluationEvent(evaluation),canManage:manager(ctx)&&!library&&evaluation?.event_type!==eventTypes[1]}};
  }catch(error){return fail(reply,error);}
 });
 app.put('/api/knowledge/cycles/:id/draft',{preHandler:auth},async(request,reply)=>{
  const ctx=request.knowledgeAuth!;if(!manager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
  const id=idSchema.safeParse(request.params),body=z.object({expectedVersion:versionSchema,evaluation:knowledgeEvaluationSchema}).safeParse(request.body);
  if(!id.success||!body.success)return reply.code(400).send({error:'KNOWLEDGE_INVALID_EVALUATION'});
  try{return {data:await save(ctx,id.data.id,body.data.expectedVersion,body.data.evaluation)};}catch(error){return fail(reply,error);}
 });
 app.post('/api/knowledge/cycles/:id/approve',{preHandler:auth},async(request,reply)=>{
  const ctx=request.knowledgeAuth!;if(!manager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
  const id=idSchema.safeParse(request.params),body=z.object({expectedVersion:z.string().regex(/^[1-9]\d*$/)}).safeParse(request.body);
  if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  try{
   const w=await cycle(ctx,id.data.id);if(!w)return reply.code(404).send({error:'KNOWLEDGE_CYCLE_NOT_FOUND'});
   const prior=await latest(id.data.id);if(!prior)return reply.code(409).send({error:'KNOWLEDGE_DRAFT_REQUIRED'});
   return {data:await save(ctx,id.data.id,body.data.expectedVersion,knowledgeEvaluationSchema.parse(prior.metadata.evaluation),true)};
  }catch(error){return fail(reply,error);}
 });
 app.post('/api/knowledge/cycles/:id/summarize',{preHandler:auth},async(request,reply)=>{
  const ctx=request.knowledgeAuth!;if(!manager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
  const id=idSchema.safeParse(request.params),body=z.object({expectedVersion:versionSchema}).safeParse(request.body);
  if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
  try{return await withHumasAnalysisLock(pool,'knowledge:'+id.data.id,async()=>{
   const w=await cycle(ctx,id.data.id);if(!w)throw Error('KNOWLEDGE_CYCLE_NOT_FOUND');
   const prior=await latest(id.data.id);if((prior?String(prior.id):null)!==body.data.expectedVersion)throw Error('KNOWLEDGE_VERSION_CONFLICT');
   if(prior?.event_type===eventTypes[1])throw Error('KNOWLEDGE_APPROVED_LOCKED');
   const source=await sources(w),facts=summarizeKnowledgeSources(source),config=await loadHumasAiTask(pool,'monitoring_analysis');
   const result=await executeHumasAi(pool,{userId:Number(ctx.id),taskCode:'evaluation_analysis',config,prompt:config.prompt+`\n\nTUGAS KHUSUS KNOWLEDGE & EVALUATION: rangkum pembelajaran dari HASIL ANALISIS SIKLUS YANG SUDAH TERSIMPAN di bawah. Jangan menganalisis ulang berita, Gap, Strakom, Publikasi, atau Monitoring. Jangan mengubah fakta, metrik, OPD, wilayah atau kecukupan bukti. Hindari menyimpulkan kausalitas atau keberhasilan komunikasi jika bukti LIMITED/INSUFFICIENT. Rumuskan pelajaran yang spesifik dengan batas penerapannya. Jangan mengarang engagement, hasil lapangan, kutipan, atau fakta baru. Output satu objek JSON: {"summary":"ringkasan evaluasi","strengths":["..."],"weaknesses":["..."],"lessons":["pelajaran dan kondisi penerapannya"],"recommendations":["..."],"tags":["..."]}. Maksimal 10 item tiap array, 1200 karakter tiap item, tag maksimal 80 karakter, summary maksimal 4000 karakter.\nDATA HASIL TERSIMPAN:\n`+JSON.stringify({source,metrics:facts.metrics})});
   const parsed=knowledgeEvaluationSchema.safeParse(result);if(!parsed.success)throw Error('AI_KNOWLEDGE_INVALID_RESULT');
   return {data:await save(ctx,id.data.id,body.data.expectedVersion,parsed.data,false,{taskCode:'evaluation_analysis',configurationTaskCode:'monitoring_analysis',provider:config.provider,model:config.model,promptVersion:config.promptVersion})};
  });}catch(error){return fail(reply,error);}
 });
}
