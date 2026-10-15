import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import type {ApifyCollectorKind} from './apify-collection-plan.js';
import {decryptIntegrationCredential} from './integration-credentials.js';
import {loadApifyGeographicSearchPlan} from './apify-geographic-search.js';
import {validateActorAdapter,renderActorTemplate,mappedField,mappedDate,yesterdayJakarta,publicationInPeriod,type ActorAdapter,type CollectionPeriod} from './apify-actor-adapter.js';
import {normalizeApifyTikTokPosts} from './apify-tiktok-post-normalizer.js';
import {normalizeApifyInstagramPosts} from './apify-instagram-post-normalizer.js';
import {normalizeApifyComment} from './apify-social-adapter.js';
import {ingestSocialBatch,type SocialCandidate} from './social-collector.js';
import {loadOrganizationMediaScope} from './organization-media-scope.js';
import {classifySocialOrganizationScope} from './social-organization-scope.js';

type Platform='tiktok'|'instagram';
type Selection=Platform|'apify';
type Parent={externalId:string;canonicalUrl:string;title:string;content:string};
type Counts={datasetItems:number;rejected:number;outOfScope:number;received:number;succeeded:number;failed:number;skipped:number;outsidePeriod:number;missingDate:number};
type Step={adapter?:ActorAdapter;kind:ApifyCollectorKind;platform:Platform;actorId:string;cap:number;limit:number;status:'QUEUED'|'STARTING'|'RUNNING'|'IMPORTING'|'DONE'|'SKIPPED'|'FAILED'|'UNCERTAIN';runId?:string;actId?:string;datasetId?:string;offset?:number;error?:string;costUsd?:number;parents?:Parent[];counts?:Counts};
export type ActiveApifyJob={jobId:string;selection:Selection;status:'RUNNING'|'DONE'|'PARTIAL'|'FAILED'|'UNCERTAIN';maxVideos:number;maxCommentsPerPost:number;monthlyCommentsLimit:number;steps:Step[];createdAt:string;period?:CollectionPeriod};
const terminal=(s:Step)=>['DONE','SKIPPED','FAILED','UNCERTAIN'].includes(s.status);
const safeActor=(id:string)=>id.trim().replace('~','/');
const actorPlatform=(kind:ApifyCollectorKind):Platform=>kind.startsWith('tiktok_')?'tiktok':'instagram';
const isComments=(kind:ApifyCollectorKind)=>kind.endsWith('_comments');
const counts=():Counts=>({datasetItems:0,rejected:0,outOfScope:0,received:0,succeeded:0,failed:0,skipped:0,outsidePeriod:0,missingDate:0});
const safeError=(e:unknown)=>e instanceof Error&&/^APIFY_[A-Z0-9_]+$/.test(e.message)?e.message:'APIFY_COLLECTION_STEP_FAILED';
function finish(job:ActiveApifyJob){
 if(job.steps.some(s=>s.status==='UNCERTAIN'))job.status='UNCERTAIN';
 else if(job.steps.every(terminal))job.status=job.steps.some(s=>s.status==='FAILED')?(job.steps.some(s=>s.status==='DONE')?'PARTIAL':'FAILED'):'DONE';
}
export function buildActiveApifySteps(settings:Awaited<ReturnType<typeof loadApifyAdminCollectorSettings>>,config:Record<string,any>,selection:Selection,maxVideos:number):Step[]{
 const enabled=settings.filter(s=>s.enabled&&(selection==='apify'||actorPlatform(s.kind)===selection));
 if(!enabled.length)throw Error('APIFY_NO_COLLECTORS_ENABLED');
 return enabled.sort((a,b)=>Number(isComments(a.kind))-Number(isComments(b.kind))).map(s=>{
  const actorId=safeActor(s.actorId);
  if(!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(actorId))throw Error('APIFY_ACTOR_ID_INVALID');
  const adapter=validateActorAdapter(config.actorAdapters?.[s.kind],actorId,isComments(s.kind));
  const cap=config.actorMaxCostUsd?.[s.kind];
  if(typeof cap!=='number'||!Number.isFinite(cap)||cap<0.01||cap>5)throw Error('APIFY_ACTOR_CHARGE_CAP_NOT_CONFIGURED');
  const platform=actorPlatform(s.kind),adminLimit=config[platform==='tiktok'?'maxTiktokPerRun':'maxInstagramPerRun'];
  if(!Number.isInteger(adminLimit)||adminLimit<0||adminLimit>100)throw Error('APIFY_ADMIN_ITEM_LIMIT_INVALID');
  return{kind:s.kind,platform,actorId,adapter,cap,limit:Math.min(maxVideos,adminLimit),status:'QUEUED'};
 });
}
export function buildActiveApifyInput(step:Step,city:string,queries:string[],commentsPerPost:number,period:CollectionPeriod=yesterdayJakarta()):Record<string,unknown>|null{
 if(step.limit===0||isComments(step.kind)&&(!step.parents?.length||commentsPerPost===0))return null;
 const adapter=validateActorAdapter(step.adapter,step.actorId,isComments(step.kind));
 const tag=city.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('id');
 if(!/^[\p{L}\p{N}_]{3,80}$/u.test(tag)||!queries.length)throw Error('APIFY_GEOGRAPHIC_CITY_INVALID');
 const scopedQueries=queries.slice(0,Math.min(5,step.limit));
 return renderActorTemplate(adapter.inputTemplate,{city,queries:scopedQueries,hashtag:tag,hashtags:[tag],limit:step.limit,perQueryLimit:Math.max(1,Math.floor(step.limit/scopedQueries.length)),parentUrls:step.parents?.map(p=>p.canonicalUrl)??[],commentsPerPost,maxComments:Math.min(500,(step.parents?.length??0)*commentsPerPost),since:period.start,until:period.end,untilInclusive:new Date(Date.parse(period.end)-1).toISOString(),sinceDate:period.date,untilDate:period.date}) as Record<string,unknown>;
}
const normalizeUrl=(value:unknown):string=>{try{const u=new URL(String(value));return u.origin+u.pathname.replace(/\/$/,'');}catch{return ''}};
export function normalizeActiveApifyItems(step:Step,items:unknown[]):{candidates:SocialCandidate[];rejected:number}{
 const adapter=validateActorAdapter(step.adapter,step.actorId,isComments(step.kind));
 const candidates:SocialCandidate[]=[];let rejected=0;
 for(const raw of items){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){rejected++;continue;}
  const output=adapter.output,id=mappedField(raw,output.id),text=mappedField(raw,output.text),publishedAt=mappedDate(mappedField(raw,output.publishedAt));
  const authorHandle=mappedField(raw,output.authorHandle),authorName=mappedField(raw,output.authorName);
  if(typeof text!=='string'||!text.trim()||typeof id!=='string'&&!(typeof id==='number'&&Number.isSafeInteger(id))){rejected++;continue;}
  let candidate:SocialCandidate|null=null;
  if(!isComments(step.kind)){
   const url=mappedField(raw,output.url),row=step.platform==='tiktok'?{id:String(id),text,webVideoUrl:url,createTime:publishedAt?Date.parse(publishedAt)/1000:null}:{shortCode:String(id),caption:text,url,timestamp:publishedAt};
   candidate=(step.platform==='tiktok'?normalizeApifyTikTokPosts([row]):normalizeApifyInstagramPosts([row])).candidates[0]??null;
  }else{
   const url=mappedField(raw,output.parentUrl),parentId=mappedField(raw,output.parentId);
   const parent=step.parents?.find(p=>!!url&&normalizeUrl(p.canonicalUrl)===normalizeUrl(url))??step.parents?.find(p=>parentId!==null&&String(parentId)===p.externalId);
   if(!parent){rejected++;continue;}
   candidate=normalizeApifyComment(step.platform,{id:String(id),text,postUrl:parent.canonicalUrl,createdAt:publishedAt});
   if(candidate)candidate.context={parentContent:parent};
  }
  if(!candidate){rejected++;continue;}
  candidate.authorHandle=typeof authorHandle==='string'?authorHandle:null;candidate.authorName=typeof authorName==='string'?authorName:null;
  candidate.publishedAt=publishedAt;candidate.collector='apify-'+step.kind;
  candidate.metadata={provider:'apify',actorId:step.actorId,runId:step.runId,collectorKind:step.kind};
  candidates.push(candidate);
 }
 return{candidates,rejected};
}
async function config(pool:Pool){
 const {rows}=await pool.query(`SELECT s.settings,c.credential_ciphertext FROM integration_settings s
 JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true
 JOIN organizations o ON o.id=s.organization_id AND o.active=true
 JOIN integration_credentials c ON c.provider_id=p.id AND c.organization_id=o.id AND c.enabled=true LIMIT 2`);
 if(rows.length!==1||!rows[0].credential_ciphertext)throw Error('APIFY_CONFIGURATION_UNAVAILABLE');
 return{settings:rows[0].settings,token:decryptIntegrationCredential(rows[0].credential_ciphertext)};
}
async function provider(path:string,token:string,init:RequestInit={}){
 return fetch('https://api.apify.com/v2/'+path,{...init,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
}
async function save(client:PoolClient,id:string,job:ActiveApifyJob){finish(job);await client.query(`UPDATE audit_logs SET metadata=$2::jsonb WHERE id=$1`,[id,JSON.stringify(job)]);}
export async function createActiveApifyJob(pool:Pool,selection:Selection,maxVideos:number,userId:string){
 const cfg=await config(pool),collectors=await loadApifyAdminCollectorSettings(pool);
 const steps=buildActiveApifySteps(collectors,cfg.settings,selection,maxVideos);
 const job:ActiveApifyJob={jobId:randomUUID(),selection,maxVideos,status:'RUNNING',maxCommentsPerPost:Math.max(0,Math.min(50,Number(cfg.settings.maxCommentsPerPost)||0)),monthlyCommentsLimit:Math.max(0,Math.min(10000,Number(cfg.settings.monthlyCommentsLimit)||0)),steps,createdAt:new Date().toISOString(),period:yesterdayJakarta()};
 const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(78124680)');
  // Resuming an unfinished collection never starts another paid copy.
  const existing=await client.query(`SELECT metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'status' IN ('RUNNING','UNCERTAIN') ORDER BY created_at DESC LIMIT 1`);
  if(existing.rows.length){await client.query('COMMIT');return existing.rows[0].metadata as ActiveApifyJob;}
  await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'APIFY_ACTIVE_COLLECTION',$2::jsonb)`,[userId,JSON.stringify(job)]);
  await client.query('COMMIT');return job;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function advanceActiveApifyJob(pool:Pool,jobId:string){
 const client=await pool.connect();let transaction=false;
 try{
  await client.query('BEGIN');transaction=true;
  const row=(await client.query(`SELECT id,metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'jobId'=$1 FOR UPDATE NOWAIT`,[jobId])).rows[0];
  if(!row)throw Error('APIFY_COLLECTION_NOT_FOUND');
  const job=row.metadata as ActiveApifyJob,step=job.steps.find(s=>!terminal(s));
  if(job.status!=='RUNNING'||!step){await client.query('COMMIT');transaction=false;return job;}
  if(step.status==='STARTING'){
   // A start request may have reached Apify. Never retry a billable POST.
   if(Date.now()-Date.parse((step as Step&{startedAt?:string}).startedAt??job.createdAt)>60000){step.status='UNCERTAIN';step.error='APIFY_START_UNCERTAIN_CHECK_APIFY_CONSOLE';await save(client,row.id,job);}
   await client.query('COMMIT');transaction=false;return job;
  }
  const cfg=await config(pool),token=cfg.token;
  job.period??=yesterdayJakarta(new Date(job.createdAt));
  step.adapter??=validateActorAdapter(cfg.settings.actorAdapters?.[step.kind],step.actorId,isComments(step.kind));
  if(step.status==='QUEUED'){
   const plan=await loadApifyGeographicSearchPlan(pool);
   if(isComments(step.kind)){
    const remaining=(await pool.query(`SELECT COUNT(*)::int n FROM social_mentions WHERE platform=$1 AND content_type IN ('comment','reply') AND collector LIKE 'apify-%' AND captured_at>=date_trunc('month',now())`,[step.platform])).rows[0]?.n??0;
    const allowance=Math.max(0,job.monthlyCommentsLimit-Number(remaining));
    const perPost=Math.min(job.maxCommentsPerPost,allowance);
    const parentLimit=perPost?Math.min(step.limit,Math.floor(Math.min(500,allowance)/perPost)):0;
    const parents=parentLimit?(await pool.query(`SELECT external_id AS "externalId",canonical_url AS "canonicalUrl",LEFT(title,300) AS title,LEFT(content,3000) AS content FROM social_mentions WHERE platform=$1 AND source_kind='external' AND content_type NOT IN ('comment','reply') AND canonical_url IS NOT NULL AND metadata->'organizationScope'->>'status'='RELEVANT' AND published_at >= $3::timestamptz AND published_at < $4::timestamptz ORDER BY published_at DESC,id DESC LIMIT $2`,[step.platform,parentLimit,job.period.start,job.period.end])).rows:[];
    step.parents=parents.filter(p=>step.platform==='tiktok'?/^https:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+\/?$/.test(p.canonicalUrl):/^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?$/.test(p.canonicalUrl));
    (step as Step&{commentsPerPost?:number}).commentsPerPost=perPost;
   }
   const input=buildActiveApifyInput(step,plan.city,plan.queries,(step as Step&{commentsPerPost?:number}).commentsPerPost??job.maxCommentsPerPost,job.period);
   if(!input){step.status='SKIPPED';step.error=isComments(step.kind)?'APIFY_NO_ELIGIBLE_PARENTS_OR_COMMENT_QUOTA':'APIFY_ADMIN_ITEM_LIMIT_ZERO';await save(client,row.id,job);await client.query('COMMIT');transaction=false;return job;}
   step.status='STARTING';(step as Step&{startedAt?:string}).startedAt=new Date().toISOString();
   await save(client,row.id,job);await client.query('COMMIT');transaction=false;
   try{
    // The configured cap goes straight to Apify. No cash-balance verification loop.
    const response=await provider('acts/'+step.actorId.replace('/','~')+'/runs?maxTotalChargeUsd='+step.cap,token,{method:'POST',body:JSON.stringify(input)});
    if(!response.ok){step.status='FAILED';step.error='APIFY_PROVIDER_REJECTED_RUN_'+response.status;}
    else{
     const run=(await response.json() as {data?:{id?:string;actId?:string}}).data;
     if(!run?.id||!run.actId||!/^\w{5,160}$/.test(run.id)||!/^\w{5,160}$/.test(run.actId))throw Error('APIFY_START_RESPONSE_INVALID');
     step.runId=run.id;step.actId=run.actId;step.status='RUNNING';
    }
   }catch{step.status='UNCERTAIN';step.error='APIFY_START_UNCERTAIN_CHECK_APIFY_CONSOLE';}
   await save(client,row.id,job);return job;
  }
  const response=await provider('actor-runs/'+encodeURIComponent(step.runId!),token);
  if(!response.ok)throw Error('APIFY_RUN_LOOKUP_FAILED');
  const run=(await response.json() as {data?:Record<string,any>}).data;
  if(!run||run.id!==step.runId||run.actId!==step.actId)throw Error('APIFY_RUN_ACTOR_IDENTITY_MISMATCH');
  if(['FAILED','ABORTED','TIMED-OUT'].includes(run.status)){step.status='FAILED';step.error='APIFY_PROVIDER_RUN_'+run.status.replace('-','_');}
  else if(run.status==='SUCCEEDED'){
   if(typeof run.defaultDatasetId!=='string'||!/^\w{5,160}$/.test(run.defaultDatasetId))throw Error('APIFY_RUN_DATASET_INVALID');
   step.datasetId=run.defaultDatasetId;step.status='IMPORTING';step.counts??=counts();step.offset??=0;
   if(typeof run.usageTotalUsd==='number')step.costUsd=run.usageTotalUsd;
   const maximum=isComments(step.kind)?Math.min(500,(step.parents?.length??0)*((step as Step&{commentsPerPost?:number}).commentsPerPost??job.maxCommentsPerPost)):step.limit;
   const pageSize=Math.min(10,maximum-step.offset);
   if(pageSize<=0)step.status='DONE';
   else{
    const dataResponse=await provider('datasets/'+step.datasetId+'/items?clean=true&offset='+step.offset+'&limit='+pageSize,token);
    if(!dataResponse.ok)throw Error('APIFY_DATASET_FETCH_FAILED');
    const items:unknown=await dataResponse.json();if(!Array.isArray(items)||items.length>pageSize)throw Error('APIFY_DATASET_SHAPE_INVALID');
    const normalized=normalizeActiveApifyItems(step,items),scope=await loadOrganizationMediaScope(client as unknown as Pool);
    if(!scope)throw Error('APIFY_ORGANIZATION_SCOPE_UNAVAILABLE');
    const dated=normalized.candidates.filter(c=>publicationInPeriod(c.publishedAt,job.period!));
    step.counts.outsidePeriod??=0;step.counts.missingDate??=0;
    step.counts.missingDate+=normalized.candidates.filter(c=>!c.publishedAt).length;
    step.counts.outsidePeriod+=normalized.candidates.filter(c=>!!c.publishedAt&&!publicationInPeriod(c.publishedAt,job.period!)).length;
    const candidates=dated.filter(c=>classifySocialOrganizationScope({title:c.title,content:c.content,context:c.context},scope).status!=='OUT_OF_SCOPE');
    const result=candidates.length?await ingestSocialBatch(client as unknown as Pool,candidates,'apify-'+step.kind):{received:0,succeeded:0,failed:0,results:[]};
    step.counts.datasetItems+=items.length;step.counts.rejected+=normalized.rejected;step.counts.outOfScope+=dated.length-candidates.length;
    step.counts.received+=result.received;step.counts.succeeded+=result.succeeded;step.counts.failed+=result.failed;step.counts.skipped+=result.results.filter(r=>r.skipped===true).length;
    step.offset+=items.length;
    if(items.length>0&&normalized.rejected===items.length){step.status='FAILED';step.error='APIFY_DATASET_NO_SUPPORTED_ITEMS';}
    if(step.status!=='FAILED'&&(items.length<pageSize||step.offset>=maximum)){step.status=step.counts.failed?'FAILED':'DONE';if(step.counts.failed)step.error='APIFY_INGESTION_FAILED';}
   }
  }
  await save(client,row.id,job);await client.query('COMMIT');transaction=false;return job;
 }catch(e){if(transaction)await client.query('ROLLBACK');if((e as {code?:string}).code==='55P03')return null;throw e;}finally{client.release();}
}
export async function registerActiveApifyRoutes(app:FastifyInstance,pool:Pool,guards:{auth:any;requireWrite:any}){
 const preHandler=[guards.auth,guards.requireWrite];
 app.get('/api/social/collection/apify/actors',{preHandler},async(request,reply)=>{
  const query=z.object({platform:z.enum(['tiktok','instagram','apify'])}).safeParse(request.query);
  if(!query.success)return reply.code(400).send({error:'APIFY_PLATFORM_INVALID'});
  try{const cfg=await config(pool);return{data:buildActiveApifySteps(await loadApifyAdminCollectorSettings(pool),cfg.settings,query.data.platform,10).map(({kind,platform,actorId,cap,limit})=>({kind,platform,actorId,cap,limit}))};}
  catch(e){return reply.code(422).send({error:safeError(e)});}
 });
 app.post('/api/social/collection/apify/jobs',{preHandler},async(request,reply)=>{
  const parsed=z.object({platform:z.enum(['tiktok','instagram','apify']),maxVideos:z.union([z.literal(10),z.literal(20),z.literal(50)]),confirmed:z.literal(true)}).strict().safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({error:'APIFY_EXPLICIT_CONFIRMATION_REQUIRED'});
  try{return{data:await createActiveApifyJob(pool,parsed.data.platform,parsed.data.maxVideos,request.socialIngestAuth!.id)}}catch(e){app.log.error({err:e},'Apify collection preparation failed');return reply.code(422).send({error:safeError(e)});}
 });
 app.get('/api/social/collection/apify/jobs/latest',{preHandler},async()=>({data:(await pool.query(`SELECT metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' ORDER BY created_at DESC LIMIT 1`)).rows[0]?.metadata??null}));
 app.get('/api/social/collection/apify/jobs/:jobId/diagnostics',{preHandler},async(request,reply)=>{
  const parsed=z.object({jobId:z.string().uuid()}).safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'APIFY_COLLECTION_ID_INVALID'});
  const job=(await pool.query(`SELECT metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'jobId'=$1`,[parsed.data.jobId])).rows[0]?.metadata as ActiveApifyJob|undefined;
  if(!job)return reply.code(404).send({error:'APIFY_COLLECTION_NOT_FOUND'});
  const cfg=await config(pool),token=cfg.token;
  const data=[];
  for(const step of job.steps.filter(s=>s.datasetId&&s.counts?.rejected)){
   const response=await provider('datasets/'+encodeURIComponent(step.datasetId!)+'/items?clean=true&limit=1',token);if(!response.ok)continue;
   const items:unknown=await response.json();if(!Array.isArray(items))continue;
   data.push({kind:step.kind,runId:step.runId,records:items.map(item=>{const r=item&&typeof item==='object'?item as Record<string,unknown>:{};return{keys:Object.keys(r).slice(0,40),error:typeof r.error==='string'?r.error.slice(0,300):null,errorDescription:typeof r.errorDescription==='string'?r.errorDescription.slice(0,500):null};})});
  }
  return{data};
 });
 app.post('/api/social/collection/apify/jobs/:jobId/advance',{preHandler},async(request,reply)=>{
  const parsed=z.object({jobId:z.string().uuid()}).safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'APIFY_COLLECTION_ID_INVALID'});
  try{const job=await advanceActiveApifyJob(pool,parsed.data.jobId);return{data:job,busy:!job};}catch(e){app.log.error({err:e},'Apify collection progress failed');return reply.code(422).send({error:safeError(e)});}
 });
}
