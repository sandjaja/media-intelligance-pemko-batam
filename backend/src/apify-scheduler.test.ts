import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runScheduledCollectionIfDue,runCollection} from './collection-scheduler.js';
import {driveBackgroundApifyJob} from './apify-background-collection.js';
import {encryptIntegrationCredential} from './integration-credentials.js';
import {apifyCallbackSignature,verifyApifyCallback,apifyCallbackBaseUrl} from './apify-callback-auth.js';
import callbackHandler from './cron-apify-complete.js';
import {collectionResultStatus} from './collection-run-result.js';
const adapters=JSON.parse(readFileSync(new URL('../config/apify-actor-adapters.json',import.meta.url),'utf8'));
const kinds=['tiktok_posts','instagram_posts','tiktok_comments','instagram_comments','tiktok_hashtag','instagram_hashtag'];
const fields=['tiktokActor','instagramActor','tiktokCommentsActor','instagramCommentsActor','tiktokHashtagActor','instagramHashtagActor'];
function fixture({enabled=true,social=true,onlineFails=false,geographyFails=false}={}){
 const settings:any={actorAdapters:adapters,actorMaxCostUsd:Object.fromEntries(kinds.map(k=>[k,.1])),maxTiktokPerRun:20,maxInstagramPerRun:10,maxCommentsPerPost:2,monthlyCommentsLimit:1000,tiktokHashtagEnabled:true,instagramHashtagEnabled:true};
 fields.forEach((field,i)=>settings[field]=adapters[kinds[i]].actorId);
 let job:any,run:any;const calls:string[]=[],updates:any[]=[];let inserts=0;
 const query=async(sql:string,params?:any[])=>{
  calls.push(sql);
  if(sql.includes('pg_try_advisory_xact_lock'))return{rows:[{acquired:true}]};
  if(sql.includes('FROM collection_scheduler_config'))return{rows:[{enabled,timezone:'Asia/Jakarta',run_time:'08:00:00',online_enabled:true,owned_enabled:true,social_enabled:social}]};
  if(sql.includes('SELECT started_at AS'))return{rows:run?[{finished_at:run.started_at}]:[]};
  if(sql.includes('SELECT id FROM collection_scheduler_runs'))return{rows:run?[{id:run.id}]:[]};
  if(sql.startsWith('INSERT INTO collection_scheduler_runs')){inserts++;run={id:'41',started_at:'2026-10-15T01:00:00Z',status:'RUNNING',result:{}};return{rows:[{id:run.id}]};}
  if(sql.includes('SELECT result FROM collection_scheduler_runs'))return{rows:[{result:structuredClone(run.result)}]};
  if(sql.startsWith('UPDATE collection_scheduler_runs SET status=$2')){run.status=params![1];run.result=JSON.parse(params![2]);updates.push(structuredClone(run));return{rows:[]};}
  if(sql.includes('FROM integration_settings'))return{rows:[{settings,credential_ciphertext:encryptIntegrationCredential('fixture-api-key')}]};
  if(sql.startsWith('INSERT INTO audit_logs')){job=JSON.parse(params![1]);return{rows:[]};}
  if(sql.includes("action='APIFY_ACTIVE_COLLECTION'")){
   if(sql.includes('FOR UPDATE'))return{rows:job?[{id:'42',metadata:structuredClone(job)}]:[]};
   if(sql.includes("metadata->>'schedulerRunId'"))return{rows:job&&job.schedulerRunId===params![0]?[{metadata:structuredClone(job)}]:[]};
   return{rows:job?[{metadata:structuredClone(job)}]:[]};
  }
  if(sql.startsWith('UPDATE audit_logs')){job=JSON.parse(params![1]);return{rows:[]};}
  if(sql.includes('FROM organizations'))return{rows:geographyFails?[]:[{id:1,name:'Pemerintah Kota Batam',code:'batam'}]};
  if(sql.includes('FROM government_branding'))return{rows:[{city_name:'Batam',government_name:'Pemko Batam'}]};
  if(sql.includes('FROM media_sources')){if(onlineFails)throw Error('fixture-online-failure');return{rows:[]};}
  if(sql.includes('SELECT external_id AS')){
   assert.equal(params![2],'2026-10-13T17:00:00.000Z');assert.equal(params![3],'2026-10-14T17:00:00.000Z');
   return{rows:[params![0]==='tiktok'?{externalId:'7345678901234567890',canonicalUrl:'https://www.tiktok.com/@batam/video/7345678901234567890',title:'Batam',content:'Batam'}:{externalId:'ABCde123',canonicalUrl:'https://www.instagram.com/p/ABCde123/',title:'Batam',content:'Batam'}]};
  }
  if(sql.includes('COUNT(*)::int n'))return{rows:[{n:0}]};
  return{rows:[]};
 };
 return{pool:{query,connect:async()=>({query,release(){}})} as any,calls,updates,job:()=>job,run:()=>run,inserts:()=>inserts};
}
test('daily Admin scheduler starts all selected collectors; completion webhooks finish every enabled Actor without a browser or duplicate paid POST',async()=>{
 const previous={...process.env},oldFetch=globalThis.fetch;
 process.env.INTEGRATION_CREDENTIAL_KEY='fixture-signing-key';process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='preview.example.com';
 const f=fixture(),requests:any[]=[],completed=new Set<string>();let starts=0;
 globalThis.fetch=async(url,init)=>{
  const u=new URL(String(url));requests.push({u,init});
  if(init?.method==='POST'){
   starts++;const hooks=JSON.parse(Buffer.from(u.searchParams.get('webhooks')!,'base64').toString());
   assert.equal(hooks[0].eventTypes.length,4);const callback=new URL(hooks[0].requestUrl);
   assert.equal(callback.origin,'https://preview.example.com');assert.equal(verifyApifyCallback(callback.searchParams.get('jobId')!,callback.searchParams.get('signature')!),true);
   return new Response(JSON.stringify({data:{id:'run12345'+starts,actId:'actor12345'+starts}}));
  }
  if(u.pathname.includes('/actor-runs/')){const id=u.pathname.split('/').pop()!;return new Response(JSON.stringify({data:{id,actId:id.replace('run','actor'),status:completed.has(id)?'SUCCEEDED':'RUNNING',defaultDatasetId:'dataset12345'}}));}
  if(u.pathname.includes('/datasets/'))return new Response('[]');
  throw Error('Unexpected provider request');
 };
 try{
  const result=await runScheduledCollectionIfDue(f.pool,new Date('2026-10-15T01:00:00Z'));
  assert.ok('status' in result);assert.equal(result.status,'RUNNING');assert.equal(starts,1);
  assert.ok(f.calls.some(s=>s.includes('FROM media_sources')));assert.ok(f.calls.some(s=>s.includes('FROM owned_social_accounts')));assert.ok(f.calls.some(s=>s.includes("p.code=$2")));
  assert.equal(f.job().steps.length,6);assert.equal(f.job().period.date,'2026-10-14');assert.equal(f.run().status,'RUNNING');
  for(let i=0;i<8&&f.job().status==='RUNNING';i++){
   const running=f.job().steps.find((s:any)=>s.status==='RUNNING');assert.ok(running);
   if(i===0)await assert.rejects(()=>driveBackgroundApifyJob(f.pool,f.job().jobId,75000,running.kind),/TERMINAL_STATUS_PENDING_RETRY/);
   completed.add(running.runId);
   await driveBackgroundApifyJob(f.pool,f.job().jobId,75000,running.kind);
  }
  assert.equal(f.job().status,'DONE');assert.equal(f.run().status,'SUCCESS');assert.equal(starts,6);
  await driveBackgroundApifyJob(f.pool,f.job().jobId);assert.equal(starts,6);
  const duplicate=await runScheduledCollectionIfDue(f.pool,new Date('2026-10-15T01:15:00Z'));
  assert.equal(duplicate.reason,'ALREADY_RAN_TODAY');assert.equal(f.inserts(),1);assert.equal(starts,6);
  assert.ok(requests.filter(r=>r.init?.method==='POST').every(r=>r.u.searchParams.get('maxTotalChargeUsd')==='0.1'));
 }finally{globalThis.fetch=oldFetch;process.env=previous;}
});
test('disabled scheduler and unselected social do not start an Apify Actor',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No provider request expected')};
 try{
  const disabled=fixture({enabled:false});assert.equal((await runScheduledCollectionIfDue(disabled.pool)).reason,'SCHEDULER_DISABLED');assert.equal(disabled.inserts(),0);
  const noSocial=fixture({social:false});const result=await runScheduledCollectionIfDue(noSocial.pool,new Date('2026-10-15T01:00:00Z'));
  assert.ok('status' in result);assert.equal(result.status,'SUCCESS');assert.equal(noSocial.job(),undefined);
 }finally{globalThis.fetch=oldFetch;}
});
test('a failed source does not prevent other selected sources; manual YouTube does not start Apify',async()=>{
 const f=fixture({onlineFails:true});const result=await runCollection(f.pool,'MANUAL','1',['online','owned','social']);
 assert.equal(result.status,'FAILED');assert.equal(f.job(),undefined);assert.ok(f.calls.some(s=>s.includes('FROM owned_social_accounts')));assert.ok(f.calls.some(s=>s.includes('FROM integration_credentials')));
 assert.match(result.result.online.error,/online-failure/);
});
test('callback authentication is bound to a job and Preview never targets production',()=>{
 const before=process.env.INTEGRATION_CREDENTIAL_KEY;process.env.INTEGRATION_CREDENTIAL_KEY='fixture';
 try{const s=apifyCallbackSignature('job-1');assert.equal(verifyApifyCallback('job-1',s),true);assert.equal(verifyApifyCallback('job-2',s),false);assert.equal(verifyApifyCallback('job-1','invalid'),false);
 assert.equal(apifyCallbackBaseUrl({VERCEL_ENV:'preview',VERCEL_URL:'preview.example.com',PUBLIC_APP_URL:'https://prod.example.com'}),'https://preview.example.com');
 assert.throws(()=>apifyCallbackBaseUrl({VERCEL_ENV:'preview',PUBLIC_APP_URL:'https://prod.example.com'}),/NOT_CONFIGURED/);
 }finally{if(before===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=before;}
});
test('history stays pending until import finishes and does not hide Apify failure',()=>{
 assert.equal(collectionResultStatus({baseComplete:true,social:{succeeded:1},apify:{status:'RUNNING'}}),'RUNNING');
 assert.equal(collectionResultStatus({apify:{status:'DONE'}}),'RUNNING');
 assert.equal(collectionResultStatus({baseComplete:true,social:{succeeded:1},apify:{status:'FAILED'}}),'PARTIAL');
 assert.equal(collectionResultStatus({baseComplete:true,apify:{status:'UNCERTAIN'}}),'FAILED');
});

test('public completion endpoint rejects missing and forged signatures before opening a database connection',async()=>{
 const original=process.env.INTEGRATION_CREDENTIAL_KEY;process.env.INTEGRATION_CREDENTIAL_KEY='fixture';
 try{for(const [method,url,expected] of [['GET','/api/cron/apify-complete',405],['POST','/api/cron/apify-complete',401],['POST','/api/cron/apify-complete?jobId=e888e670-dba2-4a20-9cb4-f77c8186153f&signature='+('0'.repeat(64)),401]] as const){
  const res:any={setHeader(){},end(){},statusCode:0};await callbackHandler({method,url} as any,res);assert.equal(res.statusCode,expected);
 }}finally{if(original===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=original;}
});

test('preparation failure before a paid start is terminal instead of waiting forever for a nonexistent callback',async()=>{
 const before={...process.env},oldFetch=globalThis.fetch;process.env.INTEGRATION_CREDENTIAL_KEY='fixture';process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='preview.example.com';
 globalThis.fetch=async()=>{throw Error('No paid request should be sent')};
 try{const f=fixture({geographyFails:true});const result=await runScheduledCollectionIfDue(f.pool,new Date('2026-10-15T01:00:00Z'));assert.ok('status' in result);assert.equal(result.status,'FAILED');assert.equal(f.job().status,'FAILED');assert.equal(f.run().result.apify.status,'FAILED');}
 finally{process.env=before;globalThis.fetch=oldFetch;}
});
