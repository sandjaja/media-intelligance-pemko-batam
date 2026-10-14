import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {prepareRunFromLedger} from './apify-ledger-run-preparation.js';
const base={reservationKey:'manual:1',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,configuredActorId:'clockworks/tiktok-scraper',configuredMaxUsd:0.5,collectorEnabled:true,pricingApproval:{actorId:'clockworks/tiktok-scraper',maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true}};
const pool=(row:unknown)=>({query:async()=>({rows:row?[row]:[]})}) as unknown as Pool;
test('only matching committed ledger reservation prepares capped request',async()=>{
 const result=await prepareRunFromLedger(pool({actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.500000'}),base);
 assert.equal(result.ready,true);
 assert.deepEqual(result.request?.query,{maxTotalChargeUsd:0.5});
});
test('missing, spent, mismatched, insufficient reservations are rejected',async()=>{
 assert.equal((await prepareRunFromLedger(pool(null),base)).ready,false);
 assert.equal((await prepareRunFromLedger(pool({actor_id:base.actorId,platform:'tiktok',status:'RUNNING',reserved_usd:'0.5'}),base)).ready,false);
 assert.equal((await prepareRunFromLedger(pool({actor_id:base.actorId,platform:'instagram',status:'RESERVED',reserved_usd:'0.5'}),base)).ready,false);
 assert.equal((await prepareRunFromLedger(pool({actor_id:base.actorId,platform:'tiktok',status:'RESERVED',reserved_usd:'0.3'}),base)).ready,false);
});
