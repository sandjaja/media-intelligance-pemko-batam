import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {reserveApifyWithAdminBudget} from './apify-admin-reservation.js';
const input={reservationKey:'test',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,estimatedUsd:0.2,providerBalanceUsd:2,credentialsVerified:true,actorConfigured:true};
test('missing Admin settings blocks reservation before any ledger write',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);return{rows:[]}},connect:()=>{throw Error('unexpected ledger transaction')}} as unknown as Pool;
 const result=await reserveApifyWithAdminBudget(pool,input);
 assert.equal(result.reason,'APIFY_ADMIN_BUDGET_UNAVAILABLE');
 assert.equal(result.reserved,false);
 assert.equal(queries.length,1);
});
test('saved Admin budget is passed into atomic reservation',async()=>{
 const statements:string[]=[];
 const client={query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('AS committed'))return{rows:[{committed:'0'}],rowCount:1};
  if(sql.includes('INSERT INTO apify_usage_ledger'))return{rows:[{id:1}],rowCount:1};
  return{rows:[],rowCount:0};
 },release:()=>{}};
 const pool={query:async()=>({rows:[{budget:'1.5'}]}),connect:async()=>client} as unknown as Pool;
 const result=await reserveApifyWithAdminBudget(pool,input);
 assert.equal(result.reserved,true);
 assert.equal(result.remainingUsd,1.3);
 assert.ok(statements.includes('COMMIT'));
});

test('missing provider USD balance blocks ledger writes',async()=>{
 const pool={query:async()=>({rows:[{budget:'1.5'}]}),connect:()=>{throw Error('ledger must not start')}} as unknown as Pool;
 const result=await reserveApifyWithAdminBudget(pool,{...input,providerBalanceUsd:null});
 assert.equal(result.reserved,false);
 assert.equal(result.reason,'APIFY_PROVIDER_BALANCE_UNAVAILABLE');
});
