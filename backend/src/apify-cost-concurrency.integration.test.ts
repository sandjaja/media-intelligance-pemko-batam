import assert from 'node:assert/strict';
import test from 'node:test';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {reserveApifyCost} from './apify-cost-reservation.js';

/** Explicit opt-in ONLY on an isolated Preview database. Never executes Apify Actors.
 * APIFY_LEDGER_TEST_DATABASE_URL must point to Preview; the test refuses
 * production or unmarked connections. Uses unique keys and cleans its rows.
 */
const url=process.env.APIFY_LEDGER_TEST_DATABASE_URL;
const preview=process.env.APIFY_LEDGER_TEST_PREVIEW==='true';
test('concurrent reservations cannot exceed shared budget (Preview opt-in)',{skip:!url||!preview},async()=>{
 const pool=new Pool({connectionString:url,max:3});
 const prefix='apify-ci-concurrency-'+randomUUID();
 const now=new Date();
 const budget=0.6,estimate=0.4;
 try{
  const results=await Promise.all([0,1].map(i=>reserveApifyCost(pool,{
   reservationKey:prefix+'-'+i,actorId:'clockworks/tiktok-scraper',
   platform:'tiktok',estimatedUsd:estimate,monthlyBudgetUsd:budget,
   providerBalanceUsd:10,now
  })));
  // Existing monthly spending may reject both; at most one may succeed.
  assert.ok(results.filter(r=>r.reserved).length<=1,JSON.stringify(results));
  assert.ok(results.every(r=>['APIFY_RESERVED','APIFY_BUDGET_EXCEEDED'].includes(r.reason)));
 }finally{
  await pool.query('DELETE FROM apify_usage_ledger WHERE reservation_key LIKE $1',[prefix+'-%']);
  await pool.end();
 }
});
