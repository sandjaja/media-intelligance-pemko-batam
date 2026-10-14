import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {executeClaimedApifyRun} from './apify-manual-executor.js';

const unreachablePool={query:async()=>{throw new Error('DATABASE_MUST_NOT_BE_TOUCHED')},
 connect:async()=>{throw new Error('DATABASE_MUST_NOT_BE_TOUCHED')}} as unknown as Pool;
const base={
 reservationKey:'test-reservation',actorId:'clockworks/tiktok-scraper',
 platform:'tiktok' as const,configuredActorId:'clockworks/tiktok-scraper',
 configuredMaxUsd:0.5,collectorEnabled:true,pricingApproval:{actorId:'clockworks/tiktok-scraper',maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true},
 claimId:'claim:test12345678',token:'secret',explicitlyConfirmed:false,
 actorInput:{searchQueries:['Batam','Sekupang Batam'],searchSection:'/video',resultsPerPage:5,commentsPerPost:0,shouldDownloadVideos:false}
};
test('executor refuses execution without explicit confirmation',async()=>{
 let called=false;
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,fetcher:async()=>{called=true;throw new Error('UNEXPECTED_NETWORK')}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_USER_CONFIRMATION_REQUIRED');
 assert.equal(called,false);
});
test('executor refuses missing token before touching ledger',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,token:' '
 });
 assert.equal(result.reason,'APIFY_TOKEN_REQUIRED');
});
test('executor refuses invalid actor input before touching ledger',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,actorInput:null as unknown as Record<string,unknown>
 });
 assert.equal(result.reason,'APIFY_ACTOR_INPUT_INVALID');
});

test('executor keeps Instagram preview-only during TikTok rollout',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,platform:'instagram',actorId:'apify/instagram-scraper',
  configuredActorId:'apify/instagram-scraper',explicitlyConfirmed:true,providerChargeCapVerified:true
 });
 assert.equal(result.reason,'APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT');
});

test('executor rejects unapproved TikTok collector without touching database',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,actorId:'clockworks/tiktok-comments-scraper',configuredActorId:'clockworks/tiktok-comments-scraper',providerChargeCapVerified:true
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT');
});

test('executor rejects unverified provider charge cap before any ledger or network access',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{...base,explicitlyConfirmed:true});
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_CHARGE_CAP_NOT_VERIFIED');
});

test('a client confirmation and charge-cap flag cannot bypass missing server pricing approval',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,pricingApproval:null
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_PRICING_APPROVAL_REQUIRED');
});

test('expired pricing approval is rejected before database or network access',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  pricingApproval:{...base.pricingApproval,verifiedAt:'2020-01-01T00:00:00.000Z'}
 });
 assert.equal(result.reason,'APIFY_PRICING_APPROVAL_EXPIRED_OR_INVALID');
});
test('approved maximum above Admin ceiling is rejected before database access',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  pricingApproval:{...base.pricingApproval,maximumRunCostUsd:0.6}
 });
 assert.equal(result.reason,'APIFY_APPROVED_COST_EXCEEDS_ADMIN_LIMIT');
});

test('fractional-cent approval cannot reach the ledger or paid provider',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  pricingApproval:{...base.pricingApproval,maximumRunCostUsd:0.495}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_PRICING_APPROVAL_EXPIRED_OR_INVALID');
});

test('disabled collector fails before any ledger claim or paid request',async()=>{
 let networkCalled=false;
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,collectorEnabled:false,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{networkCalled=true;throw new Error('NETWORK_MUST_NOT_BE_TOUCHED')}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_COLLECTOR_DISABLED');
 assert.equal(networkCalled,false);
});

test('invalid claim identifier is rejected before database or provider access',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,claimId:'claim:short'
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_CLAIM_ID_INVALID');
});

test('mocked TikTok paid request uses exact approved charge cap and records provider run',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{
  sql.push(q);
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes('SET run_id=$3'))return{rows:[{id:1}]};
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let calls=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async(input,init)=>{
   calls++;
   const url=new URL(String(input));
   assert.equal(url.searchParams.get('maxTotalChargeUsd'),'0.5');
   assert.equal(init?.method,'POST');
   return{ok:true,json:async()=>({data:{id:'provider_run_12345'}})} as Response;
  }
 });
 assert.equal(result.started,true);
 assert.equal(result.providerRunId,'provider_run_12345');
 assert.equal(calls,1);
 assert.ok(sql.some(q=>q.includes('SET run_id=$3')));
});

test('uncertain mocked provider response quarantines claimed reservation',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{
  sql.push(q);
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes("SET status='UNKNOWN'"))return{rows:[{id:1}]};
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let calls=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{calls++;throw Error('SIMULATED_TIMEOUT')}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_START_UNKNOWN_RECONCILIATION_REQUIRED');
 assert.equal(calls,1);
 assert.ok(sql.some(q=>q.includes("SET status='UNKNOWN'")));
 assert.ok(!sql.some(q=>q.includes('SET run_id=$3')));
});

test('provider starts but ledger confirmation fails: report run id for reconciliation',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{
  sql.push(q);
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes('SET run_id=$3'))return{rows:[]};
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let calls=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{calls++;return{ok:true,json:async()=>({data:{id:'provider_run_67890'}})} as Response}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_PROVIDER_STARTED_LEDGER_CONFIRMATION_FAILED');
 assert.equal(result.providerRunId,'provider_run_67890');
 assert.equal(calls,1);
 assert.ok(sql.some(q=>q.includes('SET run_id=$3')));
});

test('ledger exception after provider starts preserves run id and avoids retry',async()=>{
 const pool={query:async(q:string)=>{
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes('SET run_id=$3'))throw Error('SIMULATED_DATABASE_OUTAGE');
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let calls=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{calls++;return{ok:true,json:async()=>({data:{id:'provider_run_99999'}})} as Response}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_PROVIDER_STARTED_LEDGER_CONFIRMATION_FAILED');
 assert.equal(result.providerRunId,'provider_run_99999');
 assert.equal(calls,1);
});

test('uncertain provider start and failed quarantine returns explicit non-retryable uncertainty',async()=>{
 const pool={query:async(q:string)=>{
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes("SET status='UNKNOWN'"))throw Error('SIMULATED_LEDGER_OUTAGE');
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let calls=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{calls++;throw Error('SIMULATED_PROVIDER_TIMEOUT')}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_START_UNKNOWN_LEDGER_UNAVAILABLE');
 assert.equal(calls,1);
});

test('repeated executor invocation with same reservation never sends second paid POST',async()=>{
 let status:'RESERVED'|'RUNNING'='RESERVED';
 const pool={query:async(q:string)=>{
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status,reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'")){
   if(status!=='RESERVED')return{rows:[]};
   status='RUNNING';
   return{rows:[{reserved_usd:'0.500000'}]};
  }
  if(q.includes('SET run_id=$3'))return{rows:[{id:1}]};
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let posts=0;
 const input={...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{posts++;return{ok:true,json:async()=>({data:{id:'provider_run_once'}})} as Response}
 };
 const first=await executeClaimedApifyRun(pool,input);
 const second=await executeClaimedApifyRun(pool,input);
 assert.equal(first.started,true);
 assert.equal(second.started,false);
 assert.equal(posts,1);
});

test('provider HTTP error is treated as uncertain, not a safe retry',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{
  sql.push(q);
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes("status='RESERVED'")&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.500000'}]};
  if(q.includes("SET status='UNKNOWN'"))return{rows:[{id:1}]};
  throw Error('UNEXPECTED_SQL');
 }} as unknown as Pool;
 let posts=0;
 const result=await executeClaimedApifyRun(pool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  fetcher:async()=>{posts++;return{ok:false,status:502} as Response}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_START_UNKNOWN_RECONCILIATION_REQUIRED');
 assert.equal(posts,1);
 assert.ok(sql.some(q=>q.includes("SET status='UNKNOWN'")));
});

test('executor rejects unscoped TikTok queries before claiming funds',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  actorInput:{...base.actorInput,searchQueries:['Jakarta']}
 });
 assert.equal(result.started,false);
 assert.equal(result.reason,'APIFY_TIKTOK_GEOGRAPHIC_INPUT_NOT_VERIFIED');
});

test('executor accepts bounded 10/20/50 geographic proposals past input guard',async()=>{
 for(const [page,queries] of [[3,3],[6,3],[16,3],[10,5]] as const){
  const result=await executeClaimedApifyRun(unreachablePool,{
   ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
   actorInput:{...base.actorInput,searchQueries:Array.from({length:queries},(_,i)=>'Batam '+(i+1)),resultsPerPage:page}
  }).catch(e=>({reason:String(e)}));
  assert.notEqual(result.reason,'APIFY_TIKTOK_GEOGRAPHIC_INPUT_NOT_VERIFIED');
 }
});
test('executor rejects aggregate TikTok requests above 50 before ledger access',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,providerChargeCapVerified:true,
  actorInput:{...base.actorInput,searchQueries:['Batam','Sekupang Batam','Batu Aji Batam'],resultsPerPage:20}
 });
 assert.equal(result.reason,'APIFY_TIKTOK_GEOGRAPHIC_INPUT_NOT_VERIFIED');
});
