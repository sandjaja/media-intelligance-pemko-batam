import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { isApifyPreviewTestConnection } from './apify-preview-test-guard.js';
import { reserveGeminiDailyQuota } from './phase5-strategy-routes.js';

// Explicit opt-in only. Requires reviewed migration 154 on approved Neon Preview.
// The test creates a temporary model and quota, then removes them. No AI calls.
const url=process.env.AI_QUOTA_TEST_DATABASE_URL;
const approved=isApifyPreviewTestConnection({
 databaseUrl:url,expectedHost:process.env.AI_QUOTA_TEST_EXPECTED_HOST,
 previewFlag:process.env.AI_QUOTA_TEST_PREVIEW,
});
test('PostgreSQL enforces concurrent Gemini quota reservations (Preview opt-in)',{
 skip:!url&&!process.env.AI_QUOTA_TEST_PREVIEW,
},async()=>{
 assert.equal(approved,true,'Refusing non-approved Preview database');
 const pool=new Pool({connectionString:url,max:8});
 const model='quota-preview-test-'+process.pid+'-'+Date.now();
 let modelId:number|undefined;
 try{
  const provider=await pool.query("SELECT id FROM ai_providers WHERE code='gemini' LIMIT 1");
  assert.equal(provider.rowCount,1,'Gemini provider must exist in Preview');
  const inserted=await pool.query(`INSERT INTO ai_models(provider_id,code,name,enabled)
   VALUES($1,$2,'Preview quota concurrency test',TRUE) RETURNING id`,[provider.rows[0].id,model]);
  modelId=inserted.rows[0].id;
  await pool.query(`INSERT INTO ai_free_tier_daily_limits(model_id,max_requests,enabled)
   VALUES($1,3,TRUE)`,[modelId]);
  const outcomes=await Promise.allSettled(
   Array.from({length:10},()=>reserveGeminiDailyQuota(pool,model))
  );
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,3);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,7);
  assert.ok(outcomes.filter(x=>x.status==='rejected').every(x=>
   x.reason instanceof Error && x.reason.message==='AI_GEMINI_DAILY_QUOTA_EXCEEDED'));
  const count=await pool.query(`SELECT reserved_requests FROM ai_free_tier_daily_usage
   WHERE model_id=$1 AND usage_date=(now() AT TIME ZONE 'UTC')::date`,[modelId]);
  assert.equal(Number(count.rows[0]?.reserved_requests),3);
 }finally{
  if(modelId!==undefined)await pool.query('DELETE FROM ai_models WHERE id=$1',[modelId]);
  await pool.end();
 }
});
