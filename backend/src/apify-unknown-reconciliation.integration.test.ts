import {isApifyPreviewTestConnection} from './apify-preview-test-guard.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {reconcileUnknownApifyRun} from './apify-unknown-reconciliation.js';

/** Opt-in Preview-only database test. No billable Apify API calls.
 * Uses a fake GET response and cleans up only its own unique ledger row.
 */
const url=process.env.APIFY_LEDGER_TEST_DATABASE_URL;
const preview=isApifyPreviewTestConnection({databaseUrl:url,expectedHost:process.env.APIFY_LEDGER_TEST_EXPECTED_HOST,previewFlag:process.env.APIFY_LEDGER_TEST_PREVIEW});
test('UNKNOWN provider reconciliation updates only verified Preview ledger row',{skip:!url||!preview},async()=>{
 const pool=new Pool({connectionString:url,max:2});
 const reservationKey='apify-ci-unknown-'+randomUUID();
 const runId='run'+randomUUID().replace(/-/g,'');
 try{
  await pool.query(`INSERT INTO apify_usage_ledger
   (reservation_key,actor_id,platform,status,run_id,reserved_usd)
   VALUES ($1,$2,'tiktok','UNKNOWN',$3,0.5)`,[reservationKey,'clockworks/tiktok-scraper',runId]);
  const fetchImpl=(async(_url:string,options:RequestInit)=>{
   assert.equal(options.method,'GET');
   return{ok:true,json:async()=>({data:{id:runId,status:'SUCCEEDED',usageTotalUsd:0.18}})};
  }) as unknown as typeof fetch;
  const result=await reconcileUnknownApifyRun(pool,{reservationKey,token:'preview-test-token',fetchImpl});
  assert.deepEqual(result,{updated:true,reason:'APIFY_RECONCILED'});
  const {rows}=await pool.query('SELECT status,actual_usd,run_id FROM apify_usage_ledger WHERE reservation_key=$1',[reservationKey]);
  assert.equal(rows[0].status,'SUCCEEDED');
  assert.equal(Number(rows[0].actual_usd),0.18);
  assert.equal(rows[0].run_id,runId);
 }finally{
  await pool.query('DELETE FROM apify_usage_ledger WHERE reservation_key=$1',[reservationKey]);
  await pool.end();
 }
});
