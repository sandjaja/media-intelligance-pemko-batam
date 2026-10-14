import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {ACTIVE_ACTORS,buildActiveApifySteps,buildActiveApifyInput,normalizeActiveApifyItems,advanceActiveApifyJob,registerActiveApifyRoutes,type ActiveApifyJob} from './apify-active-collection.js';
import {encryptIntegrationCredential} from './integration-credentials.js';
const collectors=Object.entries(ACTIVE_ACTORS).map(([kind,actorId])=>({kind:kind as keyof typeof ACTIVE_ACTORS,actorId,enabled:true}));
const config={actorMaxCostUsd:Object.fromEntries(collectors.map(s=>[s.kind,0.5])),maxTiktokPerRun:20,maxInstagramPerRun:10};
test('each platform runs exactly its enabled Admin actors, discoveries before comments',()=>{
 const tiktok=buildActiveApifySteps(collectors,config,'tiktok',50);
 assert.deepEqual(tiktok.map(s=>s.kind),['tiktok_posts','tiktok_hashtag','tiktok_comments']);
 assert.ok(tiktok.every(s=>s.limit===20));
 const insta=buildActiveApifySteps(collectors,config,'instagram',20);
 assert.deepEqual(insta.map(s=>s.kind),['instagram_posts','instagram_hashtag','instagram_comments']);
 assert.ok(insta.every(s=>s.limit===10));
 assert.equal(buildActiveApifySteps(collectors.map(s=>({...s,enabled:s.kind==='instagram_posts'})),config,'apify',10).length,1);
 assert.throws(()=>buildActiveApifySteps(collectors.map(s=>({...s,enabled:false})),config,'apify',10),/NO_COLLECTORS/);
 assert.throws(()=>buildActiveApifySteps(collectors,{...config,actorMaxCostUsd:{}},'apify',10),/CHARGE_CAP/);
});
test('all six documented actor inputs are bounded and city/parent scoped',()=>{
 const steps=buildActiveApifySteps(collectors,config,'apify',10);
 for(const step of steps){
  step.parents=[{externalId:'ABCde123',canonicalUrl:'https://www.instagram.com/p/ABCde123/',title:'Batam',content:'Batam'}];
  const input=buildActiveApifyInput(step,'Batam',['Batam','Sekupang Batam'],3)!;
  if(step.kind==='tiktok_posts')assert.deepEqual(input.searchQueries,['Batam','Sekupang Batam']);
  if(step.kind==='instagram_posts'){assert.equal(input.search,'Batam');assert.equal(input.resultsLimit,10);}
  if(step.kind.endsWith('_hashtag'))assert.deepEqual(input.hashtags,['batam']);
  if(step.kind==='tiktok_comments'){assert.equal(input.commentsPerPost,3);assert.equal(input.maxRepliesPerComment,0);}
  if(step.kind==='instagram_comments'){assert.equal(input.maxItems,3);assert.equal(input.fetchReplies,false);}
 }
 const step=steps.find(s=>s.kind==='instagram_comments')!;step.parents=[];
 assert.equal(buildActiveApifyInput(step,'Batam',['Batam'],3),null);
});
test('Instagram API Dojo message/inputSource and TikTok videoWebUrl inherit only verified parent context',()=>{
 for(const platform of ['instagram','tiktok'] as const){
  const step=buildActiveApifySteps(collectors,config,platform,10).find(s=>s.kind.endsWith('_comments'))!;
  const url=platform==='instagram'?'https://www.instagram.com/p/ABCde123/':'https://www.tiktok.com/@batam/video/7345678901234567890';
  step.parents=[{externalId:'ABCde123',canonicalUrl:url,title:'Pemko Batam',content:'Pelayanan di Sekupang Batam'}];
  const item=platform==='instagram'?{id:'17919079491232885',message:'Tolong diperbaiki',inputSource:url,user:{username:'warga'},createdAt:'2026-10-15T00:00:00Z'}:{cid:'7345678901234567899',text:'Tolong diperbaiki',videoWebUrl:url,uniqueId:'warga'};
  const result=normalizeActiveApifyItems(step,[item,{...item,inputSource:'https://www.instagram.com/p/OTHER123/',videoWebUrl:'https://www.tiktok.com/@other/video/7345678901234567891'}]);
  assert.equal(result.candidates.length,1);assert.equal(result.rejected,1);
  assert.equal(result.candidates[0].content,'Tolong diperbaiki');assert.equal(result.candidates[0].context?.parentContent?.title,'Pemko Batam');
  assert.match(result.candidates[0].externalId!,/^comment:/);
 }
});
test('Instagram hashtag posts reach the same strict normalizer and keep actor provenance',()=>{
 const step=buildActiveApifySteps(collectors,config,'instagram',10).find(s=>s.kind==='instagram_hashtag')!;
 const r=normalizeActiveApifyItems(step,[{shortCode:'ABCde123',caption:'Pemko Batam',url:'https://www.instagram.com/p/ABCde123/'}]);
 assert.equal(r.candidates.length,1);assert.equal((r.candidates[0].metadata as any).collectorKind,'instagram_hashtag');
});
function state(status:'STARTING'|'RUNNING',age=0):ActiveApifyJob{
 return{jobId:'e888e670-dba2-4a20-9cb4-f77c8186153f',selection:'instagram',status:'RUNNING',maxVideos:10,maxCommentsPerPost:3,monthlyCommentsLimit:100,createdAt:new Date(Date.now()-age).toISOString(),steps:[{kind:'instagram_posts',platform:'instagram',actorId:ACTIVE_ACTORS.instagram_posts,cap:0.3,limit:10,status,runId:'run12345',actId:'actor12345'}]};
}
function fakePool(job:ActiveApifyJob){const saved:any[]=[];const query=async(sql:string,values?:any[])=>{if(sql.includes('FOR UPDATE'))return{rows:[{id:1,metadata:structuredClone(job)}]};if(sql.startsWith('UPDATE audit_logs'))saved.push(JSON.parse(values![1]));if(sql.includes('credential_ciphertext'))return{rows:[{settings:config,credential_ciphertext:encryptIntegrationCredential('fixture-token')}]};return{rows:[]};};return{pool:{query,connect:async()=>({query,release(){}})} as any,saved};}
test('interrupted or concurrent STARTING state never repeats billable POST',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call')};
 try{for(const age of [0,120000]){const fixture=fakePool(state('STARTING',age));const job=await advanceActiveApifyJob(fixture.pool,state('STARTING').jobId);assert.equal(job?.steps[0].status,age?'UNCERTAIN':'STARTING');}assert.equal(calls,0);}finally{globalThis.fetch=oldFetch;}
});
test('failed provider run is terminal without dataset fetch or another Actor start',async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='unit-test-secret';const fixture=fakePool(state('RUNNING'));const oldFetch=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(url)=>{calls.push(String(url));return new Response(JSON.stringify({data:{id:'run12345',actId:'actor12345',status:'FAILED'}}),{status:200});};
 try{const job=await advanceActiveApifyJob(fixture.pool,state('RUNNING').jobId);assert.equal(job?.status,'FAILED');assert.equal(calls.length,1);assert.match(calls[0],/actor-runs\/run12345$/);}finally{globalThis.fetch=oldFetch;delete process.env.INTEGRATION_CREDENTIAL_KEY;}
});
test('new endpoints preserve Humas/Super Admin authentication gates',async()=>{
 const app=Fastify();await registerActiveApifyRoutes(app,{} as any,{auth:async(_req:any,reply:any)=>reply.code(401).send({error:'UNAUTHENTICATED'}),requireWrite:async()=>{}});
 try{for(const [method,url] of [['GET','/api/social/collection/apify/actors?platform=instagram'],['POST','/api/social/collection/apify/jobs'],['POST','/api/social/collection/apify/jobs/e888e670-dba2-4a20-9cb4-f77c8186153f/advance']] as const){const r=await app.inject({method,url});assert.equal(r.statusCode,401);}}finally{await app.close();}
});
test('all enabled actors complete through persisted start/poll/import; retries never repeat a start',async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='unit-test-secret';
 const job:ActiveApifyJob={jobId:'e888e670-dba2-4a20-9cb4-f77c8186153f',selection:'apify',status:'RUNNING',maxVideos:10,maxCommentsPerPost:2,monthlyCommentsLimit:1000,createdAt:new Date().toISOString(),steps:buildActiveApifySteps(collectors,config,'apify',10)};
 let stored=structuredClone(job),starts=0;const requests:{url:string;body:any}[]=[];
 const query=async(sql:string,params?:any[])=>{
  if(sql.includes('FOR UPDATE'))return{rows:[{id:1,metadata:structuredClone(stored)}]};
  if(sql.startsWith('UPDATE audit_logs')){stored=JSON.parse(params![1]);return{rows:[]};}
  if(sql.includes('credential_ciphertext'))return{rows:[{settings:config,credential_ciphertext:encryptIntegrationCredential('fixture-token')}]};
  if(sql.includes('FROM organizations'))return{rows:[{id:1,name:'Pemerintah Kota Batam',code:'batam'}]};
  if(sql.includes('FROM government_branding'))return{rows:[{city_name:'Batam'}]};
  if(sql.includes('COUNT(*)::int n'))return{rows:[{n:0}]};
  if(sql.includes('SELECT external_id AS'))return{rows:[params![0]==='tiktok'?{externalId:'7345678901234567890',canonicalUrl:'https://www.tiktok.com/@batam/video/7345678901234567890',title:'Batam',content:'Batam'}:{externalId:'ABCde123',canonicalUrl:'https://www.instagram.com/p/ABCde123/',title:'Batam',content:'Batam'}]};
  return{rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})} as any;
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  const path=String(url);requests.push({url:path,body:options?.body?JSON.parse(String(options.body)):null});
  if(options?.method==='POST'){starts++;return new Response(JSON.stringify({data:{id:'run12345'+starts,actId:'actor12345'+starts}}));}
  if(path.includes('/actor-runs/')){const id=path.split('/').pop()!;return new Response(JSON.stringify({data:{id,actId:id.replace('run','actor'),status:'SUCCEEDED',defaultDatasetId:'dataset12345',usageTotalUsd:0.01}}));}
  if(path.includes('/datasets/'))return new Response('[]');
  throw Error('Unexpected provider call');
 };
 try{
  for(let i=0;i<20&&stored.status==='RUNNING';i++)await advanceActiveApifyJob(pool,job.jobId);
  assert.equal(stored.status,'DONE');assert.equal(starts,6);assert.ok(stored.steps.every(s=>s.status==='DONE'));
  await advanceActiveApifyJob(pool,job.jobId);assert.equal(starts,6);
  assert.ok(requests.filter(r=>r.body).every(r=>r.url.includes('maxTotalChargeUsd=0.5')));
  assert.equal(requests.find(r=>r.url.includes('instagram-comments-scraper-api/runs'))?.body.maxItems,2);
 }finally{globalThis.fetch=oldFetch;delete process.env.INTEGRATION_CREDENTIAL_KEY;}
});
