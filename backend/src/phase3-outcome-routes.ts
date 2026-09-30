import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { extractDynamicIssueClaims } from './issue-dynamic-claim-extractor.js';
import { matchDynamicOfficialResponseCoverage } from './issue-response-coverage.js';
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
  const actorRole=(ctx:AuthorizationContext):Phase3ActorRole=>{
    for(const role of ['super_admin','humas','opd','district','executive','viewer'] as Phase3ActorRole[])if(ctx.roles.includes(role))return role;
    return 'viewer';
  };
  const isGlobalReader=(ctx:AuthorizationContext)=>ctx.roles.some(r=>['super_admin','humas','executive','viewer'].includes(r));
  const canSeeOutcome=async(ctx:AuthorizationContext,w:any)=>{
    if(isGlobalReader(ctx))return true;
    if(ctx.roles.includes('district')&&ctx.districtId){
      const visible=await pool.query(`SELECT 1 FROM issues i WHERE i.id=$1 AND ((i.geographic_scope='CITYWIDE' OR (i.geographic_scope='DISTRICTS' AND EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$2))) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.issue_id=i.id AND c.contributor_type='DISTRICT' AND c.district_id=$2)) LIMIT 1`,[w.issue_id,ctx.districtId]);
      return Boolean(visible.rows[0]);
    }
    if(ctx.roles.includes('opd')&&ctx.opdId){
      if(String(w.lead_opd_id)===String(ctx.opdId))return true;
      const supporting=await pool.query(`SELECT 1 FROM issue_workflow_contributors WHERE issue_id=$1 AND contributor_type='OPD' AND opd_id=$2 LIMIT 1`,[w.issue_id,ctx.opdId]);
      return Boolean(supporting.rows[0]);
    }
    return false;
  };
  const isManager=(ctx:AuthorizationContext)=>ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
  const workflow=async(issueId:string)=>{
    const {rows}=await pool.query(`SELECT w.*,i.title,i.description,i.status analytical_status,i.risk_level,i.momentum,o.name lead_opd_name FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN opd o ON o.id=w.lead_opd_id WHERE w.issue_id=$1`,[issueId]);
    return rows[0]||null;
  };
  const event=async(issueId:string|number,ctx:AuthorizationContext,type:string,fromStatus:string,toStatus:string,note?:string|null,metadata:any={})=>pool.query(`INSERT INTO issue_workflow_events(issue_id,actor_user_id,actor_role,event_type,from_status,to_status,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[issueId,ctx.id,actorRole(ctx),type,fromStatus,toStatus,note||null,JSON.stringify(metadata||{})]);

  app.get('/api/phase3/outcomes',{preHandler:auth},async(request)=>{
    const ctx=request.phase3OutcomeAuth!;
    const global=isGlobalReader(ctx);
    const params:any[]=[];let scope='';
    if(!global&&ctx.roles.includes('district')){
      if(!ctx.districtId)return{data:[]};
      params.push(ctx.districtId);scope=`AND ((i.geographic_scope='CITYWIDE' OR (i.geographic_scope='DISTRICTS' AND EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$1))) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.issue_id=i.id AND c.contributor_type='DISTRICT' AND c.district_id=$1))`;
    }else if(!global&&ctx.roles.includes('opd')){
      if(!ctx.opdId)return{data:[]};
      params.push(ctx.opdId);scope=`AND (w.lead_opd_id=$1 OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.issue_id=w.issue_id AND c.contributor_type='OPD' AND c.opd_id=$1))`;
    }else if(!global)return{data:[]};
    const {rows}=await pool.query(`SELECT w.issue_id,w.workflow_status,w.lead_opd_id,w.approved_at,w.published_at,w.closed_at,w.updated_at,i.title,i.description,i.risk_level,i.momentum,i.geographic_scope,t.name taxonomy_name,o.name lead_opd_name,
      (SELECT json_build_object('id',k.id,'keyword',k.keyword) FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=i.id AND ik.keyword_role='PRIMARY' ORDER BY ik.id LIMIT 1) primary_keyword,
      COALESCE((SELECT json_agg(json_build_object('id',k.id,'keyword',k.keyword) ORDER BY ik.id) FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=i.id AND ik.keyword_role='SUPPORTING'),'[]'::json) supporting_keywords,
      COALESCE((SELECT json_agg(json_build_object('id',so.id,'name',so.name) ORDER BY so.name) FROM issue_workflow_contributors c JOIN opd so ON so.id=c.opd_id WHERE c.issue_id=i.id AND c.contributor_type='OPD'),'[]'::json) supporting_opds,
      COALESCE((SELECT json_agg(json_build_object('id',d.id,'name',d.name) ORDER BY d.name) FROM issue_districts idt JOIN districts d ON d.id=idt.district_id WHERE idt.issue_id=i.id),'[]'::json) districts,
      (SELECT e.metadata FROM issue_workflow_events e WHERE e.issue_id=w.issue_id AND e.event_type='RESPONSE_PUBLISHED' ORDER BY e.created_at DESC LIMIT 1) publication,
      (SELECT e.note FROM issue_workflow_events e WHERE e.issue_id=w.issue_id AND e.event_type='ISSUE_CLOSED' ORDER BY e.created_at DESC LIMIT 1) close_note
      FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN taxonomy_categories t ON t.id=i.taxonomy_category_id LEFT JOIN opd o ON o.id=w.lead_opd_id
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
    await pool.query(`UPDATE issue_workflows SET workflow_status='MONITORING',closed_at=NULL,updated_by=$1,updated_at=NOW() WHERE issue_id=$2`,[ctx.id,p.data.id]);
    await event(p.data.id,ctx,'MONITORING_STARTED',w.workflow_status,'MONITORING');
    return{data:await workflow(p.data.id)};
  });

  app.get('/api/phase3/issues/:id/monitoring-periods',{preHandler:auth},async(request,reply)=>{const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});const ctx=request.phase3OutcomeAuth!;if(!(await canSeeOutcome(ctx,w)))return reply.code(403).send({error:'FORBIDDEN'});const {rows}=await pool.query(`SELECT event_type,created_at,note,metadata FROM issue_workflow_events WHERE issue_id=$1 AND event_type IN ('MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC`,[p.data.id]);const periods:any[]=[];for(const e of rows){if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:e.created_at,ended_at:null,status:'MONITORING',close_note:null});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open){open.ended_at=e.created_at;open.status='CLOSED';open.close_note=e.note||null}}}return{data:periods.reverse()};});

  app.get('/api/phase3/issues/:id/monitoring-periods/:period/gap',{preHandler:auth},async(request,reply)=>{
    const parsed=z.object({id:z.string().regex(/^\\d+$/),period:z.string().regex(/^\\d+$/)}).safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_MONITORING_PERIOD'});
    const ctx=request.phase3OutcomeAuth!,issueId=parsed.data.id,periodNo=Number(parsed.data.period);
    const w=await workflow(issueId);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    if(!(await canSeeOutcome(ctx,w)))return reply.code(403).send({error:'FORBIDDEN'});
    const events=(await pool.query(`SELECT event_type,created_at,note FROM issue_workflow_events WHERE issue_id=$1 AND event_type IN ('MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC,id ASC`,[issueId])).rows;
    const periods:any[]=[];for(const e of events){if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:e.created_at,ended_at:null,status:'MONITORING',close_note:null});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open){open.ended_at=e.created_at;open.status='CLOSED';open.close_note=e.note||null}}}
    const period=periods.find(x=>x.number===periodNo);if(!period)return reply.code(404).send({error:'MONITORING_PERIOD_NOT_FOUND'});
    const end=period.ended_at||new Date();
    const online=(await pool.query(`SELECT a.id,a.title,a.published_at FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=$1 AND a.published_at >= $2 AND a.published_at <= $3 ORDER BY a.published_at ASC`,[issueId,period.started_at,end])).rows;
    const print=(await pool.query(`SELECT pa.id,pa.title,pe.edition_date published_at,pa.created_at ingested_at,ipa.created_at linked_at,ipa.decided_at FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id JOIN print_editions pe ON pe.id=pa.edition_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked' AND pe.edition_date >= $2::date AND pe.edition_date <= $3::date ORDER BY pe.edition_date ASC,pa.id ASC`,[issueId,period.started_at,end])).rows;
    const social=(await pool.query(`SELECT sm.id,sm.title,sm.published_at,sm.source_kind FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id WHERE smi.issue_id=$1 AND sm.published_at >= $2 AND sm.published_at <= $3 ORDER BY sm.published_at ASC`,[issueId,period.started_at,end])).rows;
    const externalSocial=social.filter((x:any)=>x.source_kind==='external'),owned=social.filter((x:any)=>x.source_kind==='owned');
    const external=[...online.map((x:any)=>({...x,source:'online'})),...print.map((x:any)=>({...x,source:'print'})),...externalSocial.map((x:any)=>({...x,source:'social'}))];
    const gapSnapshot=(await pool.query(`SELECT result,analyzed_at FROM issue_communication_gap_snapshots WHERE issue_id=$1 ORDER BY analyzed_at DESC LIMIT 1`,[issueId])).rows[0]||null;
    const finalResponse=(await pool.query(`SELECT s.id,s.version,s.response_text,s.facts_data,s.key_message,s.supporting_links,s.reviewed_at,s.submitted_at,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.issue_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.created_at DESC LIMIT 1`,[issueId])).rows[0]||null;
    return{data:{period,evidence:{total:external.length+owned.length,external:external.length,online:online.length,print:print.length,social:externalSocial.length,owned:owned.length},baseline:{gap:gapSnapshot?.result||null,gapAnalyzedAt:gapSnapshot?.analyzed_at||null,finalResponse},items:{online,print,social:externalSocial,owned}}};
  });

  app.post('/api/phase3/issues/:id/monitoring-periods/:period/analyze',{preHandler:auth},async(request,reply)=>{
    const parsed=z.object({id:z.string().regex(/^\\d+$/),period:z.string().regex(/^\\d+$/)}).safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_MONITORING_PERIOD'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const issueId=parsed.data.id,periodNo=Number(parsed.data.period),w=await workflow(issueId);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const events=(await pool.query(`SELECT event_type,created_at,note FROM issue_workflow_events WHERE issue_id=$1 AND event_type IN ('MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC,id ASC`,[issueId])).rows;
    const periods:any[]=[];for(const e of events){if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:e.created_at,ended_at:null,status:'MONITORING'});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open)open.ended_at=e.created_at;}}
    const period=periods.find(x=>x.number===periodNo);if(!period)return reply.code(404).send({error:'MONITORING_PERIOD_NOT_FOUND'});const end=period.ended_at||new Date();
    const online=(await pool.query(`SELECT a.id,a.title,a.published_at FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=$1 AND a.published_at >= $2 AND a.published_at <= $3 ORDER BY a.published_at ASC`,[issueId,period.started_at,end])).rows;
    const print=(await pool.query(`SELECT pa.id,pa.title,pe.edition_date published_at FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id JOIN print_editions pe ON pe.id=pa.edition_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked' AND pe.edition_date >= $2::date AND pe.edition_date <= $3::date ORDER BY pe.edition_date ASC,pa.id ASC`,[issueId,period.started_at,end])).rows;
    const social=(await pool.query(`SELECT sm.id,sm.title,sm.published_at,sm.source_kind FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id WHERE smi.issue_id=$1 AND sm.published_at >= $2 AND sm.published_at <= $3 ORDER BY sm.published_at ASC`,[issueId,period.started_at,end])).rows;
    const externalSocial=social.filter((x:any)=>x.source_kind==='external'),owned=social.filter((x:any)=>x.source_kind==='owned'),external=[...online.map((x:any)=>({...x,source:'online'})),...print.map((x:any)=>({...x,source:'print'})),...externalSocial.map((x:any)=>({...x,source:'social'}))];
    const angleResult=await extractDynamicIssueClaims(external),coverageResult=await matchDynamicOfficialResponseCoverage(angleResult.angles,owned);
    const gapSnapshot=(await pool.query(`SELECT result,analyzed_at FROM issue_communication_gap_snapshots WHERE issue_id=$1 ORDER BY analyzed_at DESC LIMIT 1`,[issueId])).rows[0]||null;
    const finalResponse=(await pool.query(`SELECT s.id,s.version,s.response_text,s.facts_data,s.key_message,s.supporting_links,s.reviewed_at,s.submitted_at,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.issue_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.created_at DESC LIMIT 1`,[issueId])).rows[0]||null;
    return{data:{period,evidence:{total:external.length+owned.length,online:online.length,print:print.length,social:externalSocial.length,owned:owned.length},baseline:{gap:gapSnapshot?.result||null,gapAnalyzedAt:gapSnapshot?.analyzed_at||null,finalResponse},analysis:{externalAngles:angleResult,semanticAssessment:coverageResult},items:{online,print,social:externalSocial,owned}}};
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
