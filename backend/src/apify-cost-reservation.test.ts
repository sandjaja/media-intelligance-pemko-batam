import assert from 'node:assert/strict';
import test from 'node:test';
import {reserveApifyCost} from './apify-cost-reservation.js';
import type {Pool} from 'pg';

/** Mock transaction-level tests; never contact Neon or execute an Actor. */
function mockPool(options:{committed:number;inserted?:number}){
 const statements:string[]=[];
 const client={
  query:async(sql:string)=>{
   statements.push(sql);
   if(sql.includes('AS committed'))return{rows:[{committed:String(options.committed)}],rowCount:1};
   if(sql.includes('INSERT INTO apify_usage_ledger'))return{rows:[],rowCount:options.inserted??1};
   return{rows:[],rowCount:0};
  },
  release:()=>{statements.push('RELEASE')}
 };
 return{pool:{connect:async()=>client} as unknown as Pool,statements};
}
const request={reservationKey:'run-test-1',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,estimatedUsd:0.5,monthlyBudgetUsd:4,providerBalanceUsd:5,now:new Date('2026-10-13T00:00:00Z')};
test('reserves cost inside one locked transaction',async()=>{
 const {pool,statements}=mockPool({committed:1});
 const result=await reserveApifyCost(pool,request);
 assert.deepEqual(result,{reserved:true,reason:'APIFY_RESERVED',remainingUsd:2.5});
 assert.equal(statements[0],'BEGIN');
 assert.ok(statements.some(s=>s.includes('pg_advisory_xact_lock')));
 assert.ok(statements.some(s=>s.includes('INSERT INTO apify_usage_ledger')));
 assert.ok(statements.includes('COMMIT'));
});
test('rejects over-budget reservations without writing ledger',async()=>{
 const {pool,statements}=mockPool({committed:3.8});
 const result=await reserveApifyCost(pool,request);
 assert.equal(result.reason,'APIFY_BUDGET_EXCEEDED');
 assert.equal(statements.includes('ROLLBACK'),true);
 assert.equal(statements.some(s=>s.includes('INSERT INTO apify_usage_ledger')),false);
});
test('rejects repeated reservation keys without charging again',async()=>{
 const {pool,statements}=mockPool({committed:1,inserted:0});
 const result=await reserveApifyCost(pool,request);
 assert.equal(result.reason,'APIFY_DUPLICATE_RESERVATION');
 assert.equal(statements.includes('ROLLBACK'),true);
});

test('invalid platform fails closed before connecting to ledger',async()=>{
 const {pool,statements}=mockPool({committed:0});
 const result=await reserveApifyCost(pool,{...request,platform:'youtube' as 'tiktok'});
 assert.equal(result.reason,'APIFY_INVALID_RESERVATION_INPUT');
 assert.equal(statements.length,0);
});

test('provider monthly headroom smaller than Admin budget blocks reservation',async()=>{
 const {pool,statements}=mockPool({committed:0});
 const result=await reserveApifyCost(pool,{...request,providerBalanceUsd:0.3});
 assert.equal(result.reason,'APIFY_BUDGET_EXCEEDED');
 assert.equal(result.remainingUsd,0.3);
 assert.equal(statements.some(s=>s.includes('INSERT INTO apify_usage_ledger')),false);
});
test('exactly remaining monthly budget is reservable',async()=>{
 const {pool}=mockPool({committed:3.5});
 const result=await reserveApifyCost(pool,request);
 assert.equal(result.reserved,true);
 assert.equal(result.remainingUsd,0);
});
test('unknown run reservations count against monthly budget',async()=>{
 const {pool,statements}=mockPool({committed:3.7});
 const result=await reserveApifyCost(pool,request);
 assert.equal(result.reserved,false);
 assert.ok(statements.some(s=>s.includes("'UNKNOWN'")));
});

test('stale provider headroom cannot double-spend locally committed allowance',async()=>{
 const {pool,statements}=mockPool({committed:0.4});
 const result=await reserveApifyCost(pool,{...request,providerBalanceUsd:0.7});
 assert.equal(result.reason,'APIFY_BUDGET_EXCEEDED');
 assert.equal(result.remainingUsd,0.3);
 assert.equal(statements.some(s=>s.includes('INSERT INTO apify_usage_ledger')),false);
});
