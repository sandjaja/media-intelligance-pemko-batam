import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';

test('shared Gemini quota reserves a request for a configured model', async () => {
  let calls = 0;
  const pool = { async query(sql: string, params: unknown[]) {
    calls++;
    assert.match(sql, /ON CONFLICT\(model_id,usage_date\) DO UPDATE/);
    assert.match(sql, /reserved_requests </);
    assert.deepEqual(params, ['gemini-2.5-flash']);
    return { rows: [{ model_id: 7 }] };
  } };
  await reserveGeminiDailyRequest(pool as any, 'gemini-2.5-flash');
  assert.equal(calls, 1);
});

test('shared Gemini quota rejects exhausted or disabled models before provider call', async () => {
  const pool = { async query() { return { rows: [] }; } };
  await assert.rejects(() => reserveGeminiDailyRequest(pool as any, 'gemini-2.5-flash'), /AI_GEMINI_DAILY_QUOTA_EXCEEDED_OR_DISABLED/);
});
