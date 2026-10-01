import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { phase5Auth?: AuthorizationContext } }

const paramsSchema=z.object({issueId:z.string().regex(/^\d+$/),workflowId:z.string().regex(/^\d+$/)});
const strategyFields=z.object({
 communicationObjectives:z.array(z.any()).default([]),
 targetAudiences:z.array(z.any()).default([]),
 keyMessages:z.array(z.any()).default([]),
 talkingPoints:z.array(z.any()).default([]),
 channelStrategy:z.array(z.any()).default([]),
 timingStrategy:z.record(z.any()).default({}),
 spokespersonStrategy:z.array(z.any()).default([]),
 contentFormats:z.array(z.any()).default([]),
 communicationRisks:z.array(z.any()).default([]),
 successKpis:z.array(z.any()).default([])
});
const reviewSchema=z.object({note:z.string().trim().max(4000).nullable().optional()});

export async function registerPhase5StrategyRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(401).send({error:'USER_INACTIVE_OR_MISSING'});request.phase5Auth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
 const workflow=async(issueId:string,workflowId:string)=>(await pool.query(`SELECT w.*,i.title,i.description,i.risk_level,i.momentum,i.geographic_scope,o.name lead_opd_name FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN opd o ON o.id=w.lead_opd_id WHERE w.id=$1 AND w.issue_id=$2`,[workflowId,issueId])).rows[0]||null;
 const snapshot=async(w:any)=>{
  const [gap,response,publication,monitoring,keywords,districts]=await Promise.all([
   pool.query('SELECT * FROM issue_communication_gap_snapshots WHERE workflow_id=$1',[w.id]),
   pool.query("SELECT response_text,facts_data,key_message,supporting_links,version,approved_at FROM issue_response_submissions WHERE workflow_id=$1 AND status='APPROVED' ORDER BY version DESC LIMIT 1",[w.id]),
   pool.query('SELECT result,gap_analyzed_at,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[w.id]),
   pool.query('SELECT period_number,result,evidence_summary,period_started_at,period_ended_at,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 ORDER BY period_number',[w.id]),
   pool.query("SELECT k.term,ik.keyword_role FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=$1 ORDER BY CASE WHEN ik.keyword_role='PRIMARY' THEN 0 ELSE 1 END,k.term",[w.issue_id]),
   pool.query('SELECT d.id,d.name FROM issue_districts x JOIN districts d ON d.id=x.district_id WHERE x.issue_id=$1 ORDER BY d.name',[w.issue_id])
  ]);
  return {capturedAt:new Date().toISOString(),issue:{id:w.issue_id,title:w.title,description:w.description,riskLevel:w.risk_level,momentum:w.momentum,geographicScope:w.geographic_scope},workflow:{id:w.id,cycleNumber:w.cycle_number,status:w.workflow_status,leadOpdId:w.lead_opd_id,leadOpdName:w.lead_opd_name},keywords:keywords.rows,districts:districts.rows,gap:gap.rows[0]||null,approvedResponse:response.rows[0]||null,publicationAnalysis:publication.rows[0]||null,monitoringAnalysis:monitoring.rows};
 };
 const requireRead=(ctx:AuthorizationContext)=>hasPermission(ctx,'strategy.read')||hasPermission(ctx,'strategy.manage');
 const requireManage=(ctx:AuthorizationContext)=>hasPermission(ctx,'strategy.manage');

 app.get('/api/phase5/issues/:issueId/workflows/:workflowId/strategy',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_WORKFLOW'});const ctx=request.phase5Auth!;if(!requireRead(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.issueId,p.data.workflowId);if(!w)return reply.code(404).send({error:'WORKFLOW_NOT_FOUND'});
  const rows=(await pool.query('SELECT * FROM communication_strategies WHERE workflow_id=$1 ORDER BY version DESC',[w.id])).rows;return{data:{workflow:w,strategies:rows}};
 });
 app.post('/api/phase5/issues/:issueId/workflows/:workflowId/strategy/draft',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_WORKFLOW'});const ctx=request.phase5Auth!;if(!requireManage(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.issueId,p.data.workflowId);if(!w)return reply.code(404).send({error:'WORKFLOW_NOT_FOUND'});const gap=(await pool.query('SELECT 1 FROM issue_communication_gap_snapshots WHERE workflow_id=$1',[w.id])).rows[0];if(!gap)return reply.code(409).send({error:'COMMUNICATION_GAP_REQUIRED'});const open=(await pool.query("SELECT * FROM communication_strategies WHERE workflow_id=$1 AND status IN ('DRAFT','IN_REVIEW') ORDER BY version DESC LIMIT 1",[w.id])).rows[0];if(open)return reply.code(409).send({error:'OPEN_STRATEGY_EXISTS',data:open});
  const version=Number((await pool.query('SELECT COALESCE(MAX(version),0)+1 v FROM communication_strategies WHERE workflow_id=$1',[w.id])).rows[0].v),input=await snapshot(w);
  const row=(await pool.query("INSERT INTO communication_strategies(workflow_id,issue_id,version,status,input_snapshot,generated_by,generated_at,created_by,updated_by) VALUES($1,$2,$3,'DRAFT',$4::jsonb,$5,NOW(),$5,$5) RETURNING *",[w.id,w.issue_id,version,JSON.stringify(input),ctx.id])).rows[0];return reply.code(201).send({data:row});
 });
 app.put('/api/phase5/issues/:issueId/workflows/:workflowId/strategy/:version',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.extend({version:z.coerce.number().int().positive()}).safeParse(request.params),b=strategyFields.safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_STRATEGY'});const ctx=request.phase5Auth!;if(!requireManage(ctx))return reply.code(403).send({error:'FORBIDDEN'});
  const v=b.data;const row=(await pool.query(`UPDATE communication_strategies SET communication_objectives=$1::jsonb,target_audiences=$2::jsonb,key_messages=$3::jsonb,talking_points=$4::jsonb,channel_strategy=$5::jsonb,timing_strategy=$6::jsonb,spokesperson_strategy=$7::jsonb,content_formats=$8::jsonb,communication_risks=$9::jsonb,success_kpis=$10::jsonb,updated_by=$11,updated_at=NOW() WHERE workflow_id=$12 AND issue_id=$13 AND version=$14 AND status='DRAFT' RETURNING *`,[JSON.stringify(v.communicationObjectives),JSON.stringify(v.targetAudiences),JSON.stringify(v.keyMessages),JSON.stringify(v.talkingPoints),JSON.stringify(v.channelStrategy),JSON.stringify(v.timingStrategy),JSON.stringify(v.spokespersonStrategy),JSON.stringify(v.contentFormats),JSON.stringify(v.communicationRisks),JSON.stringify(v.successKpis),ctx.id,p.data.workflowId,p.data.issueId,p.data.version])).rows[0];if(!row)return reply.code(409).send({error:'STRATEGY_NOT_EDITABLE'});return{data:row};
 });
 app.post('/api/phase5/issues/:issueId/workflows/:workflowId/strategy/:version/review',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.extend({version:z.coerce.number().int().positive()}).safeParse(request.params),b=reviewSchema.safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_REVIEW'});const ctx=request.phase5Auth!;if(!requireManage(ctx))return reply.code(403).send({error:'FORBIDDEN'});const row=(await pool.query("UPDATE communication_strategies SET status='IN_REVIEW',review_note=$1,reviewed_by=$2,reviewed_at=NOW(),updated_by=$2,updated_at=NOW() WHERE workflow_id=$3 AND issue_id=$4 AND version=$5 AND status='DRAFT' RETURNING *",[b.data.note||null,ctx.id,p.data.workflowId,p.data.issueId,p.data.version])).rows[0];if(!row)return reply.code(409).send({error:'STRATEGY_NOT_DRAFT'});return{data:row};
 });
 app.post('/api/phase5/issues/:issueId/workflows/:workflowId/strategy/:version/approve',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.extend({version:z.coerce.number().int().positive()}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_APPROVAL'});const ctx=request.phase5Auth!;if(!requireManage(ctx)||!ctx.roles.some(r=>['super_admin','humas'].includes(r)))return reply.code(403).send({error:'FORBIDDEN'});const row=(await pool.query("UPDATE communication_strategies SET status='APPROVED',approved_by=$1,approved_at=NOW(),updated_by=$1,updated_at=NOW() WHERE workflow_id=$2 AND issue_id=$3 AND version=$4 AND status='IN_REVIEW' RETURNING *",[ctx.id,p.data.workflowId,p.data.issueId,p.data.version])).rows[0];if(!row)return reply.code(409).send({error:'STRATEGY_NOT_IN_REVIEW'});return{data:row};
 });
 app.post('/api/phase5/issues/:issueId/workflows/:workflowId/strategy/revise',{preHandler:auth},async(request,reply)=>{
  const p=paramsSchema.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_WORKFLOW'});const ctx=request.phase5Auth!;if(!requireManage(ctx))return reply.code(403).send({error:'FORBIDDEN'});const approved=(await pool.query("SELECT * FROM communication_strategies WHERE workflow_id=$1 AND issue_id=$2 AND status='APPROVED' ORDER BY version DESC LIMIT 1",[p.data.workflowId,p.data.issueId])).rows[0];if(!approved)return reply.code(409).send({error:'APPROVED_STRATEGY_REQUIRED'});const open=(await pool.query("SELECT 1 FROM communication_strategies WHERE workflow_id=$1 AND status IN ('DRAFT','IN_REVIEW') LIMIT 1",[p.data.workflowId])).rows[0];if(open)return reply.code(409).send({error:'OPEN_STRATEGY_EXISTS'});const w=await workflow(p.data.issueId,p.data.workflowId);if(!w)return reply.code(404).send({error:'WORKFLOW_NOT_FOUND'});const input=await snapshot(w),version=Number(approved.version)+1;
  const row=(await pool.query(`INSERT INTO communication_strategies(workflow_id,issue_id,version,status,input_snapshot,communication_objectives,target_audiences,key_messages,talking_points,channel_strategy,timing_strategy,spokesperson_strategy,content_formats,communication_risks,success_kpis,generated_by,generated_at,created_by,updated_by) SELECT workflow_id,issue_id,$1,'DRAFT',$2::jsonb,communication_objectives,target_audiences,key_messages,talking_points,channel_strategy,timing_strategy,spokesperson_strategy,content_formats,communication_risks,success_kpis,$3,NOW(),$3,$3 FROM communication_strategies WHERE id=$4 RETURNING *`,[version,JSON.stringify(input),ctx.id,approved.id])).rows[0];return reply.code(201).send({data:row});
 });
}
