import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import type {ApifyCollectorKind} from './apify-collection-plan.js';
import {decryptIntegrationCredential} from './integration-credentials.js';
import {loadApifyGeographicSearchPlan} from './apify-geographic-search.js';
import {previewGeographicActorInput} from './apify-geographic-input.js';
import {normalizeApifyTikTokPosts} from './apify-tiktok-post-normalizer.js';
import {normalizeApifyInstagramPosts} from './apify-instagram-post-normalizer.js';
import {normalizeApifyComment} from './apify-social-adapter.js';
import {ingestSocialBatch,type SocialCandidate} from './social-collector.js';
import {loadOrganizationMediaScope} from './organization-media-scope.js';
import {classifySocialOrganizationScope} from './social-organization-scope.js';

export const ACTIVE_ACTORS:Record<ApifyCollectorKind,string>={
 tiktok_posts:'clockworks/tiktok-scraper',instagram_posts:'apify/instagram-scraper',
 tiktok_comments:'clockworks/tiktok-comments-scraper',instagram_comments:'apidojo/instagram-comments-scraper-api',
 tiktok_hashtag:'clockworks/tiktok-hashtag-scraper',instagram_hashtag:'apify/instagram-hashtag-scraper'
};
type Platform='tiktok'|'instagram';
type Selection=Platform|'apify';
type Parent={externalId:string;canonicalUrl:string;title:string;content:string};
type Counts={datasetItems:number;rejected:number;outOfScope:number;received:number;succeeded:number;failed:number;skipped:number};
type Step={kind:ApifyCollectorKind;platform:Platform;actorId:string;cap:number;limit:number;status:'QUEUED'|'STARTING'|'RUNNING'|'IMPORTING'|'DONE'|'SKIPPED'|'FAILED'|'UNCERTAIN';runId?:string;actId?:string;datasetId?:string;offset?:number;error?:string;costUsd?:number;parents?:Parent[];counts?:Counts};
export type ActiveApifyJob={jobId:string;selection:Selection;status:'RUNNING'|'DONE'|'PARTIAL'|'FAILED'|'UNCERTAIN';maxVideos:number;maxCommentsPerPost:number;monthlyCommentsLimit:number;steps:Step[];createdAt:string};
const terminal=(s:Step)=>['DONE','SKIPPED','FAILED','UNCERTAIN'].includes(s.status);
const safeActor=(id:string)=>id.trim().replace('~','/');
const actorPlatform=(kind:ApifyCollectorKind):Platform=>kind.startsWith('tiktok_')?'tiktok':'instagram';
const isComments=(kind:ApifyCollectorKind)=>kind.endsWith('_comments');
const counts=():Counts=>({datasetItems:0,rejected:0,outOfScope:0,received:0,succeeded:0,failed:0,skipped:0});
const safeError=(e:unknown)=>e instanceof Error&&/^APIFY_[A-Z0-9_]+$/.test(e.message)?e.message:'APIFY_COLLECTION_STEP_FAILED';
function finish(job:ActiveApifyJob){
 if(job.steps.some(s=>s.status==='UNCERTAIN'))job.status='UNCERTAIN';
 else if(job.steps.every(terminal))job.status=job.steps.some(s=>s.status==='FAILED')?(job.steps.some(s=>s.status==='DONE')?'PARTIAL':'FAILED'):'DONE';
}
export function buildActiveApifySteps(settings:Awaited<ReturnType<typeof loadApifyAdminCollectorSettings>>,config:Record<string,any>,selection:Selection,maxVideos:number):Step[]{
 const enabled=settings.filter(s=>s.enabled&&(selection==='apify'||actorPlatform(s.kind)===selection));
 if(!enabled.length)throw Error('APIFY_NO_COLLECTORS_ENABLED');
 return enabled.sort((a,b)=>Number(isComments(a.kind))-Number(isComments(b.kind))).map(s=>{
  if(safeActor(s.actorId)!==ACTIVE_ACTORS[s.kind])throw Error('APIFY_CONFIGURED_ACTOR_NOT_SUPPORTED');
  const cap=config.actorMaxCostUsd?.[s.kind];
  if(typeof cap!=='number'||!Number.isFinite(cap)||cap<0.01||cap>5)throw Error('APIFY_ACTOR_CHARGE_CAP_NOT_CONFIGURED');
  const platform=actorPlatform(s.kind),adminLimit=config[platform==='tiktok'?'maxTiktokPerRun':'maxInstagramPerRun'];
  if(!Number.isInteger(adminLimit)||adminLimit<0||adminLimit>100)throw Error('APIFY_ADMIN_ITEM_LIMIT_INVALID');
  return{kind:s.kind,platform,actorId:safeActor(s.actorId),cap,limit:Math.min(maxVideos,adminLimit),status:'QUEUED'};
 });
}
export function buildActiveApifyInput(step:Step,city:string,queries:string[],commentsPerPost:number):Record<string,unknown>|null{
 if(step.limit===0)return null;
 const tag=city.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('id');
 if(!/^[\p{L}\p{N}_]{3,80}$/u.test(tag))throw Error('APIFY_GEOGRAPHIC_CITY_INVALID');
 if(isComments(step.kind)){
  if(!step.parents?.length||commentsPerPost===0)return null;
  const urls=step.parents.map(p=>p.canonicalUrl);
  return step.platform==='tiktok'?{postURLs:urls,commentsPerPost,maxRepliesPerComment:0}:
   {startUrls:urls,maxItems:Math.min(500,urls.length*commentsPerPost),fetchReplies:false,continueOnDuplicates:false};
 }
 if(step.kind==='tiktok_hashtag')return{hashtags:[tag],resultsPerPage:step.limit,shouldDownloadVideos:false};
 if(step.kind==='instagram_hashtag')return{hashtags:[tag],resultsType:'posts',resultsLimit:step.limit};
 if(step.kind==='instagram_posts')return{search:'#'+tag,searchType:'hashtag',resultsType:'posts',resultsLimit:step.limit,searchLimit:1};
 // Reuse the proven TikTok input adapter, retaining the total Admin item limit.
 const target=([10,20,50].includes(step.limit)?step.limit:10) as 10|20|50;
 const proposed=previewGeographicActorInput({actorId:step.actorId,plan:{organizationId:0,city,queries,excludedAmbiguousTerms:[]},maxVideos:target,maxQueries:Math.min(5,step.limit)}).proposedInput;
 proposed.resultsPerPage=Math.max(1,Math.floor(step.limit/Math.min(5,step.limit,queries.length)));
 return proposed;
}
const normalizeUrl=(value:unknown):string=>{try{const u=new URL(String(value));return u.origin+u.pathname.replace(/\/$/,'');}catch{return ''}};
export function normalizeActiveApifyItems(step:Step,items:unknown[]):{candidates:SocialCandidate[];rejected:number}{
 if(!isComments(step.kind)){
  const result=step.platform==='tiktok'?normalizeApifyTikTokPosts(items):normalizeApifyInstagramPosts(items);
  result.candidates.forEach(c=>{c.collector='apify-'+step.kind;c.metadata={...(c.metadata as object),actorId:step.actorId,runId:step.runId,collectorKind:step.kind};});
  return result;
 }
 const candidates:SocialCandidate[]=[];let rejected=0;
 for(const raw of items){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){rejected++;continue;}
  const row=raw as Record<string,any>;
  const url=row.videoWebUrl??row.inputSource??row.postUrl??row.videoUrl??row.inputUrl;
  const parent=step.parents?.find(p=>normalizeUrl(p.canonicalUrl)===normalizeUrl(url))??
   step.parents?.find(p=>String(row.postId??row.videoId??'')===p.externalId);
  // Provider text cannot invent a parent or borrow a different post's scope.
  if(!parent){rejected++;continue;}
  const mapped={...row,text:row.text??row.message,postUrl:parent.canonicalUrl,username:row.username??row.uniqueId??row.user?.username};
  const candidate=normalizeApifyComment(step.platform,mapped,parent.canonicalUrl);
  if(!candidate){rejected++;continue;}
  candidate.context={parentContent:parent};candidate.collector='apify-'+step.kind;
  candidate.metadata={...(candidate.metadata as object),actorId:step.actorId,runId:step.runId,collectorKind:step.kind};
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
 const job:ActiveApifyJob={jobId:randomUUID(),selection,maxVideos,status:'RUNNING',maxCommentsPerPost:Math.max(0,Math.min(50,Number(cfg.settings.maxCommentsPerPost)||0)),monthlyCommentsLimit:Math.max(0,Math.min(10000,Number(cfg.settings.monthlyCommentsLimit)||0)),steps,createdAt:new Date().toISOString()};
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
  const {token}=await config(pool);
  if(step.status==='QUEUED'){
   const plan=await loadApifyGeographicSearchPlan(pool);
   if(isComments(step.kind)){
    const remaining=(await pool.query(`SELECT COUNT(*)::int n FROM social_mentions WHERE platform=$1 AND content_type IN ('comment','reply') AND collector LIKE 'apify-%' AND captured_at>=date_trunc('month',now())`,[step.platform])).rows[0]?.n??0;
    const allowance=Math.max(0,job.monthlyCommentsLimit-Number(remaining));
    const perPost=Math.min(job.maxCommentsPerPost,allowance);
    const parentLimit=perPost?Math.min(step.limit,Math.floor(Math.min(500,allowance)/perPost)):0;
    const parents=parentLimit?(await pool.query(`SELECT external_id AS "externalId",canonical_url AS "canonicalUrl",LEFT(title,300) AS title,LEFT(content,3000) AS content FROM social_mentions WHERE platform=$1 AND source_kind='external' AND content_type NOT IN ('comment','reply') AND canonical_url IS NOT NULL AND metadata->'organizationScope'->>'status'='RELEVANT' ORDER BY captured_at DESC,id DESC LIMIT $2`,[step.platform,parentLimit])).rows:[];
    step.parents=parents.filter(p=>step.platform==='tiktok'?/^https:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+\/?$/.test(p.canonicalUrl):/^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?$/.test(p.canonicalUrl));
    (step as Step&{commentsPerPost?:number}).commentsPerPost=perPost;
   }
   const input=buildActiveApifyInput(step,plan.city,plan.queries,(step as Step&{commentsPerPost?:number}).commentsPerPost??job.maxCommentsPerPost);
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
    const candidates=normalized.candidates.filter(c=>classifySocialOrganizationScope({title:c.title,content:c.content,context:c.context},scope).status!=='OUT_OF_SCOPE');
    const result=candidates.length?await ingestSocialBatch(client as unknown as Pool,candidates,'apify-'+step.kind):{received:0,succeeded:0,failed:0,results:[]};
    step.counts.datasetItems+=items.length;step.counts.rejected+=normalized.rejected;step.counts.outOfScope+=normalized.candidates.length-candidates.length;
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
  const {token}=await config(pool);const data=[];
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
