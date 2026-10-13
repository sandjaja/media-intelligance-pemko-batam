import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {reserveApifyWithLiveLimits} from './apify-live-reservation.js';
const input={reservationKey:'test',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,estimatedUsd:0.2,credentialsVerified:true,actorConfigured:true};
test('unknown cost estimate fails before database or provider requests',async()=>{
 const pool={query:()=>{throw Error('unexpected database access')}} as unknown as Pool;
 const fetcher=(async()=>{throw Error('unexpected network access')}) as typeof fetch;
 const result=await reserveApifyWithLiveLimits(pool,{...input,estimatedUsd:null},fetcher);
 assert.equal(result.reason,'APIFY_ESTIMATE_REQUIRED');
});
test('unavailable account limits prevent ledger reservation',async()=>{
 let queries=0;
 const pool={query:async()=>{queries++;return{rows:[{budget:'4'}]}},connect:()=>{throw Error('unexpected reservation')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,input,async()=>{throw Error('network unavailable')});
 assert.equal(result.reason,'APIFY_ACCOUNT_LIMITS_UNAVAILABLE');
 assert.equal(queries,2);
});
