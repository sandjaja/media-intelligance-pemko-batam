import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';

test('shared Gemini quota reserves a request for a configured model', async () => {
  let calls = 0;
  const pool = { async query(sql: string, params: unknown[]) {
    calls++;
    if (calls === 1) {
      assert.match(sql, /ON CONFLICT\(model_id,usage_date\) DO UPDATE/);
      assert.match(sql, /reserved_requests </);
      assert.deepEqual(params, ['gemini-2.5-flash']);
      return { rows: [{ model_id: 7 }] };
    }
    assert.match(sql, /INSERT INTO ai_gemini_quota_feature_audit/);
    assert.deepEqual(params, [7, 'unattributed']);
    return { rows: [] };
  } };
  await reserveGeminiDailyRequest(pool as any, 'gemini-2.5-flash');
  assert.equal(calls, 2);
});

test('shared Gemini quota rejects exhausted or disabled models before provider call', async () => {
  const pool = { async query() { return { rows: [] }; } };
  await assert.rejects(() => reserveGeminiDailyRequest(pool as any, 'gemini-2.5-flash'), /AI_GEMINI_DAILY_QUOTA_EXCEEDED_OR_DISABLED/);
});


test('missing feature audit table does not undo a successful Gemini quota reservation', async () => {
  let calls = 0;
  const pool = { async query() {
    calls++;
    if (calls === 1) return { rows: [{ model_id: 7 }] };
    throw new Error('relation ai_gemini_quota_feature_audit does not exist');
  } };
  await reserveGeminiDailyRequest(pool as any, 'gemini-2.5-flash', 'executive_brief');
  assert.equal(calls, 2);
});
