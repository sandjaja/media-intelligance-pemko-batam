import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {prepareAndClaimApifyRun} from './apify-claim-orchestrator.js';
const base={reservationKey:'manual:1',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,configuredActorId:'clockworks/tiktok-scraper',configuredMaxUsd:0.5,collectorEnabled:true,claimId:'claim:abcdefgh1234',pricingApproval:{actorId:'clockworks/tiktok-scraper',maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true}};
test('orchestrator verifies ledger before claiming, never calls provider',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{sql.push(q);return{rows:q.startsWith('SELECT')?[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]:[{reserved_usd:'0.500000'}]}}} as unknown as Pool;
 const result=await prepareAndClaimApifyRun(pool,base);
 assert.equal(result.ready,true);
 assert.equal(result.request?.query.maxTotalChargeUsd,0.5);
 assert.equal(sql.length,2);
 assert.match(sql[1],/status='RESERVED'/);
});
test('duplicate claim prevents prepared request release',async()=>{
 const pool={query:async(q:string)=>({rows:q.startsWith('SELECT')?[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]:[]})} as unknown as Pool;
 const result=await prepareAndClaimApifyRun(pool,base);
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_RESERVATION_NOT_CLAIMABLE');
});

test('claimed amount above Admin ceiling is quarantined before provider request',async()=>{
 const sql:string[]=[];
 const pool={query:async(q:string)=>{
  sql.push(q);
  if(q.startsWith('SELECT'))return{rows:[{actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}]};
  if(q.includes('UPDATE apify_usage_ledger')&&q.includes("status='RUNNING'"))return{rows:[{reserved_usd:'0.750000'}]};
  return{rows:[],rowCount:1};
 }} as unknown as Pool;
 const result=await prepareAndClaimApifyRun(pool,base);
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_CLAIM_AMOUNT_MISMATCH');
 assert.ok(sql.some(q=>q.includes('UNKNOWN')));
});
