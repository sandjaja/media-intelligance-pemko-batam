import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { isApifyPreviewTestConnection } from './apify-preview-test-guard.js';

// Read-only verification. Explicit opt-in, Preview only; no migrations,
// quota writes, provider requests, or Production database access.
const url=process.env.AI_QUOTA_TEST_DATABASE_URL;
const approved=isApifyPreviewTestConnection({
 databaseUrl:url,
 expectedHost:process.env.AI_QUOTA_TEST_EXPECTED_HOST,
 previewFlag:process.env.AI_QUOTA_TEST_PREVIEW,
});
test('Gemini quota schema exists on approved Preview (read-only opt-in)',{
 skip:!url&&!process.env.AI_QUOTA_TEST_PREVIEW,
},async()=>{
 assert.equal(approved,true,'Refusing non-approved Preview database');
 const pool=new Pool({connectionString:url,max:1});
 try{
  const r=await pool.query(`SELECT
   to_regclass('public.ai_free_tier_daily_limits') IS NOT NULL AS limits_exist,
   to_regclass('public.ai_free_tier_daily_usage') IS NOT NULL AS usage_exist`);
  assert.equal(r.rows[0].limits_exist,true,'Apply reviewed migration 154 to Preview first');
  assert.equal(r.rows[0].usage_exist,true,'Apply reviewed migration 154 to Preview first');
  const columns=await pool.query(`SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN
    ('ai_free_tier_daily_limits','ai_free_tier_daily_usage')`);
  const names=new Set(columns.rows.map(x=>x.table_name+'.'+x.column_name));
  for(const key of [
   'ai_free_tier_daily_limits.model_id',
   'ai_free_tier_daily_limits.max_requests',
   'ai_free_tier_daily_limits.enabled',
   'ai_free_tier_daily_usage.model_id',
   'ai_free_tier_daily_usage.usage_date',
   'ai_free_tier_daily_usage.reserved_requests',
  ])assert.ok(names.has(key),'Missing '+key);
 }finally{await pool.end();}
});
