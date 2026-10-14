import {isApifyPreviewTestConnection} from './apify-preview-test-guard.js';
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
const preview=isApifyPreviewTestConnection({databaseUrl:url,expectedHost:process.env.APIFY_LEDGER_TEST_EXPECTED_HOST,previewFlag:process.env.APIFY_LEDGER_TEST_PREVIEW});
test('concurrent reservations cannot exceed shared budget (Preview opt-in)',{skip:!url||!preview},async()=>{
 const pool=new Pool({connectionString:url,max:3});
 const prefix='apify-ci-concurrency-'+randomUUID();
 const now=new Date();
 const estimate=0.4;
 // Measure existing commitments so this test exercises contention even on
 // a Preview branch that already has prior Apify ledger entries.
 const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
 const baseline=await pool.query(`SELECT COALESCE(SUM(GREATEST(reserved_usd,COALESCE(actual_usd,0))),0)::text AS committed FROM apify_usage_ledger WHERE started_at >= $1 AND started_at < $2`,[monthStart,nextMonth]);
 const budget=Number(baseline.rows[0].committed)+0.6;
 try{
  const results=await Promise.all([0,1].map(i=>reserveApifyCost(pool,{
   reservationKey:prefix+'-'+i,actorId:'clockworks/tiktok-scraper',
   platform:'tiktok',estimatedUsd:estimate,monthlyBudgetUsd:budget,
   providerBalanceUsd:10,now
  })));
  // Existing monthly spending may reject both; at most one may succeed.
  assert.equal(results.filter(r=>r.reserved).length,1,JSON.stringify(results));
  assert.ok(results.every(r=>['APIFY_RESERVED','APIFY_BUDGET_EXCEEDED'].includes(r.reason)));
 }finally{
  await pool.query('DELETE FROM apify_usage_ledger WHERE reservation_key LIKE $1',[prefix+'-%']);
  await pool.end();
 }
});
