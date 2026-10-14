import assert from 'node:assert/strict';
import test from 'node:test';
import {loadApifyMonthlyLedgerCommitment} from './apify-monthly-ledger-summary.js';
import type {Pool} from 'pg';

test('reads committed amounts for current UTC month without writes',async()=>{
 let sql='';
 const pool={query:async(query:string,params:unknown[])=>{
  sql=query;
  assert.equal((params[0] as Date).toISOString(),'2026-10-01T00:00:00.000Z');
  assert.equal((params[1] as Date).toISOString(),'2026-11-01T00:00:00.000Z');
  return{rows:[{committed:'1.25'}]};
 }} as unknown as Pool;
 assert.equal(await loadApifyMonthlyLedgerCommitment(pool,new Date('2026-10-14T10:00:00Z')),1.25);
 assert.match(sql,/apify_usage_ledger/);
 assert.match(sql,/GREATEST\(reserved_usd/);
});
test('missing ledger fails closed rather than reporting zero spend',async()=>{
 const pool={query:async()=>{throw Error('relation missing')}} as unknown as Pool;
 assert.equal(await loadApifyMonthlyLedgerCommitment(pool),null);
});
