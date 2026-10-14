import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {executeClaimedApifyRun} from './apify-manual-executor.js';

const unreachablePool={query:async()=>{throw new Error('DATABASE_MUST_NOT_BE_TOUCHED')},
 connect:async()=>{throw new Error('DATABASE_MUST_NOT_BE_TOUCHED')}} as unknown as Pool;
const base={
 reservationKey:'test-reservation',actorId:'clockworks/tiktok-scraper',
 platform:'tiktok' as const,configuredActorId:'clockworks/tiktok-scraper',
 configuredMaxUsd:0.5,collectorEnabled:true,pricingApproval:null,
 claimId:'claim:test12345678',token:'secret',explicitlyConfirmed:false,
 actorInput:{hashtags:['batam']}
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
  ...base,explicitlyConfirmed:true,token:' '
 });
 assert.equal(result.reason,'APIFY_TOKEN_REQUIRED');
});
test('executor refuses invalid actor input before touching ledger',async()=>{
 const result=await executeClaimedApifyRun(unreachablePool,{
  ...base,explicitlyConfirmed:true,actorInput:null as unknown as Record<string,unknown>
 });
 assert.equal(result.reason,'APIFY_ACTOR_INPUT_INVALID');
});
