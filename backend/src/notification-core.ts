import type { Pool, PoolClient } from 'pg';

export const NOTIFICATION_EVENT_TYPES = [
  'ISSUE_ASSIGNED',
  'CONTRIBUTOR_CLARIFICATION_REQUESTED',
  'SUPPORTING_OPD_CLARIFICATION_SUBMITTED',
  'DISTRICT_CONTRIBUTION_SUBMITTED',
  'CONTRIBUTOR_FOLLOW_UP_REQUESTED',
  'RESPONSE_SUBMITTED',
  'REVISION_REQUESTED',
  'RESPONSE_APPROVED',
  'EXECUTIVE_NOTE',
] as const;

type Db = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;
type WorkflowEvent = {
  id:string; workflow_id:string; issue_id:string; actor_user_id:string|null;
  event_type:string; note:string|null; metadata:Record<string,unknown>;
};
type Recipient = { id:string; email:string; opd_id:string|null; district_id:string|null };
type Template = { title_template:string; body_template:string };

const render=(template:string,vars:Record<string,string>) =>
  template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_m,key)=>vars[key]??'');

async function usersByRole(db:Db,role:string,excludeUserId:string|null){
  const {rows}=await db.query(
    `SELECT DISTINCT u.id,u.email,u.opd_id,u.district_id
       FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.active=true AND r.code=$1 AND ($2::bigint IS NULL OR u.id<>$2::bigint)`,
    [role,excludeUserId],
  );
  return rows as Recipient[];
}
async function usersByOpd(db:Db,opdId:unknown,excludeUserId:string|null){
  if(!opdId)return [];
  const {rows}=await db.query(
    `SELECT DISTINCT u.id,u.email,u.opd_id,u.district_id
       FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.active=true AND r.code='opd' AND u.opd_id=$1 AND ($2::bigint IS NULL OR u.id<>$2::bigint)`,
    [opdId,excludeUserId],
  );
  return rows as Recipient[];
}
async function usersByDistrict(db:Db,districtId:unknown,excludeUserId:string|null){
  if(!districtId)return [];
  const {rows}=await db.query(
    `SELECT DISTINCT u.id,u.email,u.opd_id,u.district_id
       FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.active=true AND r.code='district' AND u.district_id=$1 AND ($2::bigint IS NULL OR u.id<>$2::bigint)`,
    [districtId,excludeUserId],
  );
  return rows as Recipient[];
}

async function contributor(db:Db,assignmentId:unknown){
  if(!assignmentId)return null;
  return (await db.query(
    `SELECT id,contributor_type,opd_id,district_id FROM issue_workflow_contributors WHERE id=$1 LIMIT 1`,
    [assignmentId],
  )).rows[0]||null;
}

export async function resolveNotificationRecipients(db:Db,event:WorkflowEvent):Promise<Recipient[]>{
  const meta=event.metadata||{}, actor=event.actor_user_id;
  let recipients:Recipient[]=[];
  switch(event.event_type){
    case 'ISSUE_ASSIGNED':
      recipients=await usersByOpd(db,meta.leadOpdId,actor); break;
    case 'CONTRIBUTOR_CLARIFICATION_REQUESTED':
    case 'CONTRIBUTOR_FOLLOW_UP_REQUESTED': {
      const c=await contributor(db,meta.contributorAssignmentId);
      recipients=c?.contributor_type==='OPD'
        ? await usersByOpd(db,c.opd_id,actor)
        : c?.contributor_type==='DISTRICT'
          ? await usersByDistrict(db,c.district_id,actor)
          : [];
      break;
    }
    case 'SUPPORTING_OPD_CLARIFICATION_SUBMITTED':
    case 'DISTRICT_CONTRIBUTION_SUBMITTED':
    case 'REVISION_REQUESTED':
    case 'RESPONSE_APPROVED': {
      const w=(await db.query('SELECT lead_opd_id FROM issue_workflows WHERE id=$1 LIMIT 1',[event.workflow_id])).rows[0];
      recipients=await usersByOpd(db,w?.lead_opd_id,actor); break;
    }
    case 'RESPONSE_SUBMITTED':
      recipients=await usersByRole(db,'humas',actor); break;
    case 'EXECUTIVE_NOTE': {
      const w=(await db.query('SELECT lead_opd_id FROM issue_workflows WHERE id=$1 LIMIT 1',[event.workflow_id])).rows[0];
      recipients=[...(await usersByRole(db,'humas',actor)),...(await usersByOpd(db,w?.lead_opd_id,actor))]; break;
    }
  }
  return [...new Map(recipients.map(x=>[String(x.id),x])).values()];
}

async function templateVariables(db:Db,event:WorkflowEvent){
  const issue=(await db.query('SELECT title FROM issues WHERE id=$1 LIMIT 1',[event.issue_id])).rows[0];
  const workflow=(await db.query('SELECT due_at,lead_opd_id FROM issue_workflows WHERE id=$1 LIMIT 1',[event.workflow_id])).rows[0];
  const actor=event.actor_user_id?(await db.query('SELECT email,opd_id,district_id FROM users WHERE id=$1 LIMIT 1',[event.actor_user_id])).rows[0]:null;
  let senderName=actor?.email||'Media Intelligence Pemko Batam';
  if(actor?.opd_id)senderName=(await db.query('SELECT name FROM opd WHERE id=$1 LIMIT 1',[actor.opd_id])).rows[0]?.name||senderName;
  else if(actor?.district_id)senderName=(await db.query('SELECT name FROM districts WHERE id=$1 LIMIT 1',[actor.district_id])).rows[0]?.name||senderName;
  return {
    issue_title:String(issue?.title||''),
    sender_name:String(senderName),
    due_at:workflow?.due_at?new Date(workflow.due_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'-',
    note:String(event.note||''),
  };
}

export async function enqueueNotificationForWorkflowEvent(db:Db,eventId:string|number){
  const event=(await db.query(
    `SELECT id,workflow_id,issue_id,actor_user_id,event_type,note,metadata
       FROM issue_workflow_events WHERE id=$1 LIMIT 1`,[eventId],
  )).rows[0] as WorkflowEvent|undefined;
  if(!event || !NOTIFICATION_EVENT_TYPES.includes(event.event_type as any))return {queued:0,reason:'EVENT_NOT_NOTIFIABLE'};
  const template=(await db.query(
    'SELECT title_template,body_template FROM notification_templates WHERE event_type=$1 AND enabled=true LIMIT 1',
    [event.event_type],
  )).rows[0] as Template|undefined;
  if(!template)return {queued:0,reason:'TEMPLATE_DISABLED_OR_MISSING'};
  const recipients=await resolveNotificationRecipients(db,event);
  if(!recipients.length)return {queued:0,reason:'NO_RECIPIENT'};
  const vars=await templateVariables(db,event);
  const title=render(template.title_template,vars),message=render(template.body_template,vars);
  let queued=0;
  for(const recipient of recipients){
    const channels=(await db.query(
      `SELECT code FROM notification_channels WHERE status='ACTIVE' AND code IN ('EMAIL','TELEGRAM') ORDER BY code`,
    )).rows.map((x:any)=>String(x.code));
    for(const channel of channels){
      if(channel==='TELEGRAM'){
        const linked=(await db.query(
          `SELECT 1 FROM user_notification_channels WHERE user_id=$1 AND channel='TELEGRAM' AND enabled=true AND verified_at IS NOT NULL AND chat_id IS NOT NULL LIMIT 1`,
          [recipient.id],
        )).rows[0];
        if(!linked)continue;
      }
      const destinationHint=channel==='EMAIL'
        ? recipient.email.replace(/^(.{1,2}).*(@.*)$/,'$1••••$2')
        : 'Telegram terhubung';
      const result=await db.query(
        `INSERT INTO notification_deliveries(workflow_event_id,event_type,user_id,channel,status,title_snapshot,message_snapshot,destination_hint)
         VALUES($1,$2,$3,$4,'PENDING',$5,$6,$7)
         ON CONFLICT(workflow_event_id,user_id,channel) DO NOTHING RETURNING id`,
        [event.id,event.event_type,recipient.id,channel,title,message,destinationHint],
      );
      queued+=result.rowCount||0;
    }
  }
  return {queued};
}

export async function safeEnqueueNotificationForWorkflowEvent(db:Db,eventId:string|number,logger?:{error:(value:unknown,msg?:string)=>void}){
  try{return await enqueueNotificationForWorkflowEvent(db,eventId);}
  catch(error){logger?.error({error,eventId},'notification enqueue failed');return {queued:0,reason:'ENQUEUE_FAILED'};}
}


export async function enqueueNotificationForEarlyWarningAlert(db:Db,alertId:string|number,actorUserId:string|number|null){
  const alert=(await db.query(
    `SELECT a.id,a.issue_id,a.status,a.alert_type,i.title issue_title,i.status issue_status,i.risk_level,
            (SELECT im.risk_score FROM issue_metrics im WHERE im.issue_id=i.id ORDER BY im.measured_at DESC,im.id DESC LIMIT 1) risk_score,
            (SELECT im.velocity_score FROM issue_metrics im WHERE im.issue_id=i.id ORDER BY im.measured_at DESC,im.id DESC LIMIT 1) velocity_score,
            (SELECT io.opd_id FROM issue_opd io WHERE io.issue_id=i.id AND lower(COALESCE(io.responsibility,''))='leading' ORDER BY io.opd_id LIMIT 1) lead_opd_id,
            (SELECT w.cycle_number FROM issue_workflows w WHERE w.issue_id=i.id AND w.workflow_status<>'CLOSED' ORDER BY w.cycle_number DESC,w.id DESC LIMIT 1) cycle_number,
            (SELECT w.workflow_status FROM issue_workflows w WHERE w.issue_id=i.id AND w.workflow_status<>'CLOSED' ORDER BY w.cycle_number DESC,w.id DESC LIMIT 1) workflow_status
       FROM alerts a JOIN issues i ON i.id=a.issue_id
      WHERE a.id=$1 AND a.alert_type='media_issue_early_warning' AND a.status IN ('open','acknowledged') LIMIT 1`,
    [alertId],
  )).rows[0];
  if(!alert)return {queued:0,reason:'ALERT_NOT_NOTIFIABLE'};
  const template=(await db.query(
    `SELECT title_template,body_template FROM notification_templates WHERE event_type='EARLY_WARNING_ACTIVATED' AND enabled=true LIMIT 1`,
  )).rows[0] as Template|undefined;
  if(!template)return {queued:0,reason:'TEMPLATE_DISABLED_OR_MISSING'};
  const actor=actorUserId==null?null:String(actorUserId);
  const recipients=[
    ...(await usersByRole(db,'humas',actor)),
    ...(await usersByRole(db,'executive',actor)),
    ...(await usersByOpd(db,alert.lead_opd_id,actor)),
  ];
  const unique=[...new Map(recipients.map(x=>[String(x.id),x])).values()];
  if(!unique.length)return {queued:0,reason:'NO_RECIPIENT'};
  const cycleContext=alert.cycle_number
    ? `Siklus #${Number(alert.cycle_number)} sedang terbuka (${String(alert.workflow_status||'-')}).`
    : 'Belum ada siklus komunikasi terbuka.';
  const vars={
    issue_title:String(alert.issue_title||''),
    risk_score:String(Math.round(Number(alert.risk_score||0))),
    risk_level:String(alert.risk_level||'-'),
    velocity_score:String(Math.round(Number(alert.velocity_score||0))),
    issue_status:String(alert.issue_status||'-').toUpperCase(),
    cycle_context:cycleContext,
  };
  const title=render(template.title_template,vars),message=render(template.body_template,vars);
  const channels=(await db.query(
    `SELECT code FROM notification_channels WHERE status='ACTIVE' AND code IN ('EMAIL','TELEGRAM') ORDER BY code`,
  )).rows.map((x:any)=>String(x.code));
  let queued=0;
  for(const recipient of unique){
    for(const channel of channels){
      if(channel==='TELEGRAM'){
        const linked=(await db.query(
          `SELECT 1 FROM user_notification_channels WHERE user_id=$1 AND channel='TELEGRAM' AND enabled=true AND verified_at IS NOT NULL AND chat_id IS NOT NULL LIMIT 1`,
          [recipient.id],
        )).rows[0];
        if(!linked)continue;
      }
      const destinationHint=channel==='EMAIL'
        ? recipient.email.replace(/^(.{1,2}).*(@.*)$/,'$1••••$2')
        : 'Telegram terhubung';
      const result=await db.query(
        `INSERT INTO notification_deliveries(alert_id,event_type,user_id,channel,status,title_snapshot,message_snapshot,destination_hint)
         VALUES($1,'EARLY_WARNING_ACTIVATED',$2,$3,'PENDING',$4,$5,$6)
         ON CONFLICT(alert_id,user_id,channel) WHERE alert_id IS NOT NULL DO NOTHING RETURNING id`,
        [alert.id,recipient.id,channel,title,message,destinationHint],
      );
      queued+=result.rowCount||0;
    }
  }
  return {queued};
}

export async function safeEnqueueNotificationForEarlyWarningAlert(db:Db,alertId:string|number,actorUserId:string|number|null,logger?:{error:(value:unknown,msg?:string)=>void}){
  try{return await enqueueNotificationForEarlyWarningAlert(db,alertId,actorUserId);}
  catch(error){logger?.error({error,alertId},'early warning notification enqueue failed');return {queued:0,reason:'ENQUEUE_FAILED'};}
}
