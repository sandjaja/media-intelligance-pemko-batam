import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {preflightApifyReservation} from './apify-reservation-preflight.js';
const input={reservationKey:'test-1',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,estimatedUsd:0.2,adminMonthlyBudgetUsd:4,providerBalanceUsd:5,credentialsVerified:true,actorConfigured:true};
test('missing Admin budget, balance, estimate and credentials fail before database access',async()=>{
 const pool={connect:()=>{throw Error('database must not be accessed')}} as unknown as Pool;
 const cases=[
  [{...input,adminMonthlyBudgetUsd:null},'APIFY_ADMIN_BUDGET_UNAVAILABLE'],
  [{...input,providerBalanceUsd:null},'APIFY_PROVIDER_BALANCE_UNAVAILABLE'],
  [{...input,estimatedUsd:null},'APIFY_ESTIMATE_REQUIRED'],
  [{...input,credentialsVerified:false},'APIFY_CREDENTIAL_UNVERIFIED'],
  [{...input,actorConfigured:false},'APIFY_ACTOR_NOT_CONFIGURED'],
 ] as const;
 for(const [request,reason] of cases){
  const result=await preflightApifyReservation(pool,request);
  assert.equal(result.reserved,false);
  assert.equal(result.reason,reason);
 }
});

test('insufficient verified provider balance fails before ledger access',async()=>{
 const pool={connect:()=>{throw Error('ledger must not be accessed')}} as unknown as Pool;
 const result=await preflightApifyReservation(pool,{...input,estimatedUsd:0.5,providerBalanceUsd:0.49});
 assert.equal(result.reserved,false);
 assert.equal(result.reason,'APIFY_PROVIDER_BALANCE_INSUFFICIENT');
});
