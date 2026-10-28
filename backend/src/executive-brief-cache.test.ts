import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimExecutiveBriefDay, completeExecutiveBriefDay,
  failExecutiveBriefDay, readLatestExecutiveBrief,
} from './executive-brief-cache.js';

test('Executive Brief daily claim accepts one execution and rejects duplicates', async () => {
  let claimed = false;
  const db = { query: async (sql: string) => {
    assert.match(sql, /ON CONFLICT \(brief_date,scope_key\) DO NOTHING/);
    if (claimed) return { rows: [] };
    claimed = true;
    return { rows: [{ brief_date: '2026-10-16' }] };
  } };
  assert.equal(await claimExecutiveBriefDay(db as never, '2026-10-16'), true);
  assert.equal(await claimExecutiveBriefDay(db as never, '2026-10-16'), false);
});

test('Executive Brief daily claim rejects malformed dates without querying DB', async () => {
  const db = { query: async () => { throw Error('must not query'); } };
  await assert.rejects(claimExecutiveBriefDay(db as never, 'tomorrow'), /INVALID_BRIEF_DATE/);
});

test('Executive Brief completion requires active lock and stores structured JSON', async () => {
  const db = { query: async (sql: string, params: unknown[]) => {
    assert.match(sql, /locked_until > now\(\)/);
    assert.equal(params[2], JSON.stringify({ headline: 'Ringkasan' }));
    assert.equal(params[3], 'gemini-flash');
    assert.equal(params[4], 10);
    return { rows: [{ brief_date: '2026-10-16' }] };
  } };
  assert.equal(await completeExecutiveBriefDay(db as never, '2026-10-16', 'city', { headline: 'Ringkasan' }, 'gemini-flash', 10), true);
});

test('Executive Brief failed execution is recorded without retrying', async () => {
  let calls = 0;
  const db = { query: async (sql: string, params: unknown[]) => {
    calls++;
    assert.match(sql, /SET status='failed'/);
    assert.equal(params[2], 'GEMINI_QUOTA_UNAVAILABLE');
    return { rows: [] };
  } };
  await failExecutiveBriefDay(db as never, '2026-10-16', 'city', 'GEMINI_QUOTA_UNAVAILABLE');
  assert.equal(calls, 1);
});

test('Executive Brief dashboard reader only fetches stored ready result', async () => {
  const db = { query: async (sql: string) => {
    assert.match(sql, /status='ready'/);
    return { rows: [{ brief_date: '2026-10-16', status: 'ready', brief_json: { headline: 'Ringkasan' } }] };
  } };
  const result = await readLatestExecutiveBrief(db as never);
  assert.equal(result?.brief_json?.headline, 'Ringkasan');
});
