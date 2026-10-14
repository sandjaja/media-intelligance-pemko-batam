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
 const pool={query:async(sql:string)=>{queries++;return{rows:sql.includes('SELECT s.settings\n')?[{settings:{tiktokActor:'clockworks/tiktok-scraper'}}]:[{budget:'4'}]}},connect:()=>{throw Error('unexpected reservation')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,input,async()=>{throw Error('network unavailable')});
 assert.equal(result.reason,'APIFY_ACTOR_LIMIT_UNAVAILABLE');
 assert.equal(queries,3);
});

test('per-actor ceiling blocks excessive estimate before provider access',async()=>{
 const pool={query:async(sql:string)=>sql.includes('SELECT s.settings\n')?{rows:[{settings:{tiktokActor:'clockworks/tiktok-scraper'}}]}:sql.includes('actorMaxCostUsd')?{rows:[{limits:{tiktok_posts:0.5}}]}:{rows:[{budget:'4'}]}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,{...input,estimatedUsd:0.6},async()=>{throw Error('unexpected provider access')});
 assert.equal(result.reason,'APIFY_ACTOR_LIMIT_EXCEEDED');
});

test('disabled hashtag is rejected before provider access or cost reservation',async()=>{
 let queries=0;
 const pool={query:async()=>{queries++;return{rows:[{settings:{tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',tiktokHashtagEnabled:false}}]}},connect:()=>{throw Error('unexpected reservation')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,{...input,actorId:'clockworks/tiktok-hashtag-scraper'},async()=>{throw Error('unexpected provider access')});
 assert.equal(result.reason,'APIFY_ACTOR_DISABLED_OR_NOT_CONFIGURED');
 assert.equal(queries,1);
});

test('duplicate Actor IDs cannot bypass checkbox through another collector',async()=>{
 let queries=0;
 const pool={query:async()=>{queries++;return{rows:[{settings:{tiktokActor:'clockworks/tiktok-scraper',tiktokHashtagActor:'clockworks/tiktok-scraper',tiktokHashtagEnabled:false}}]}},connect:()=>{throw Error('unexpected reservation')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,input,async()=>{throw Error('unexpected provider access')});
 assert.equal(result.reason,'APIFY_ACTOR_ID_AMBIGUOUS');
 assert.equal(queries,1);
});

test('unavailable balance never reaches paid reservation',async()=>{
 const pool={query:async(sql:string)=>sql.includes('SELECT s.settings\n')?{rows:[{settings:{tiktokActor:'clockworks/tiktok-scraper'}}]}:sql.includes('actorMaxCostUsd')?{rows:[{limits:{tiktok_posts:0.5}}]}:sql.includes('credential_ciphertext')?{rows:[]}:{rows:[{budget:'4'}]},connect:()=>{throw Error('reservation must not run')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,input);
 assert.equal(result.reserved,false);
 assert.equal(result.reason,'APIFY_ACCOUNT_LIMITS_UNAVAILABLE');
});

test('invalid encrypted credential prevents reservation',async()=>{
 const pool={query:async(sql:string)=>sql.includes('SELECT s.settings\n')?{rows:[{settings:{tiktokActor:'clockworks/tiktok-scraper'}}]}:sql.includes('actorMaxCostUsd')?{rows:[{limits:{tiktok_posts:0.5}}]}:sql.includes('credential_ciphertext')?{rows:[{credential_ciphertext:'invalid'}]}:{rows:[{budget:'4'}]},connect:()=>{throw Error('unexpected reservation')}} as unknown as Pool;
 const result=await reserveApifyWithLiveLimits(pool,input);
 assert.equal(result.reserved,false);
 assert.equal(result.reason,'APIFY_ACCOUNT_LIMITS_UNAVAILABLE');
});
