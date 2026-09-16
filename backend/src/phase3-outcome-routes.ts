import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { canTransitionPhase3, type Phase3ActorRole, type Phase3WorkflowStatus } from './phase3-workflow-policy.js';

declare module 'fastify' { interface FastifyRequest { phase3OutcomeAuth?: AuthorizationContext } }

const idParam=z.object({id:z.string().regex(/^\d+$/)});
const publishInput=z.object({
  channel:z.enum(['website','instagram','facebook','tiktok','youtube','x','threads','press_release','media_statement','other']),
  url:z.string().url().max(2000).nullable().optional(),
  note:z.string().trim().max(4000).nullable().optional(),
});
const closeInput=z.object({note:z.string().trim().min(3).max(4000)});

export async function registerPhase3OutcomeRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,d.sub);
      if(!ctx?.active)return reply.code(401).send({error:'USER_INACTIVE_OR_MISSING'});
      request.phase3OutcomeAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const actorRole=(ctx:AuthorizationContext):Phase3ActorRole=>(ctx.roles[0]||'viewer') as Phase3ActorRole;
  const isManager=(ctx:AuthorizationContext)=>ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
  const workflow=async(issueId:string)=>{
    const {rows}=await pool.query(`SELECT w.*,i.title,i.description,i.status analytical_status,i.risk_level,i.momentum,o.name lead_opd_name FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN opd o ON o.id=w.lead_opd_id WHERE w.issue_id=$1`,[issueId]);
    return rows[0]||null;
  };
  const event=async(issueId:string|number,ctx:AuthorizationContext,type:string,fromStatus:string,toStatus:string,note?:string|null,metadata:any={})=>pool.query(`INSERT INTO issue_workflow_events(issue_id,actor_user_id,actor_role,event_type,from_status,to_status,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[issueId,ctx.id,actorRole(ctx),type,fromStatus,toStatus,note||null,JSON.stringify(metadata||{})]);

  app.get('/api/phase3/outcomes',{preHandler:auth},async(request)=>{
    const ctx=request.phase3OutcomeAuth!;
    const global=ctx.roles.some(r=>['super_admin','humas','executive','viewer'].includes(r));
    const params:any[]=[];let scope='';
    if(!global&&ctx.roles.includes('opd')){params.push(ctx.opdId);scope=`AND (w.lead_opd_id=$1 OR EXISTS(SELECT 1 FROM issue_workflow_supporting_opd s WHERE s.issue_id=w.issue_id AND s.opd_id=$1))`;}
    const {rows}=await pool.query(`SELECT w.issue_id,w.workflow_status,w.lead_opd_id,w.approved_at,w.published_at,w.closed_at,w.updated_at,i.title,i.description,i.risk_level,i.momentum,o.name lead_opd_name,
      (SELECT e.metadata FROM issue_workflow_events e WHERE e.issue_id=w.issue_id AND e.event_type='RESPONSE_PUBLISHED' ORDER BY e.created_at DESC LIMIT 1) publication,
      (SELECT e.note FROM issue_workflow_events e WHERE e.issue_id=w.issue_id AND e.event_type='ISSUE_CLOSED' ORDER BY e.created_at DESC LIMIT 1) close_note
      FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN opd o ON o.id=w.lead_opd_id
      WHERE w.workflow_status IN ('APPROVED','PUBLISHED','MONITORING','CLOSED') ${scope}
      ORDER BY CASE w.workflow_status WHEN 'APPROVED' THEN 0 WHEN 'PUBLISHED' THEN 1 WHEN 'MONITORING' THEN 2 ELSE 3 END,w.updated_at DESC`,params);
    return{data:rows};
  });

  app.post('/api/phase3/issues/:id/publish',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=publishInput.safeParse(request.body);
    if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_PUBLICATION'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'PUBLISHED',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'PUBLISHED'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='PUBLISHED',published_at=NOW(),updated_by=$1,updated_at=NOW() WHERE issue_id=$2`,[ctx.id,p.data.id]);
    await event(p.data.id,ctx,'RESPONSE_PUBLISHED',w.workflow_status,'PUBLISHED',b.data.note??null,{channel:b.data.channel,url:b.data.url??null});
    return{data:await workflow(p.data.id)};
  });

  app.post('/api/phase3/issues/:id/monitor',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'MONITORING',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'MONITORING'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='MONITORING',updated_by=$1,updated_at=NOW() WHERE issue_id=$2`,[ctx.id,p.data.id]);
    await event(p.data.id,ctx,'MONITORING_STARTED',w.workflow_status,'MONITORING');
    return{data:await workflow(p.data.id)};
  });

  app.post('/api/phase3/issues/:id/close',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=closeInput.safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_CLOSE'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'CLOSED',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'CLOSED'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='CLOSED',closed_at=NOW(),updated_by=$1,updated_at=NOW() WHERE issue_id=$2`,[ctx.id,p.data.id]);
    await event(p.data.id,ctx,'ISSUE_CLOSED',w.workflow_status,'CLOSED',b.data.note);
    return{data:await workflow(p.data.id)};
  });
}
