import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { listPendingAiReservations } from './ai-budget-reconciliation.js';

test('reconciliation queue only reads aged pending reservations', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = { query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return { rows: [{ reservation_id: 7, provider_code: 'gemini', reserved_usd: '0.25' }] };
  } } as unknown as Pool;
  const rows = await listPendingAiReservations(pool);
  assert.equal(rows.length, 1);
  assert.deepEqual(calls[0].params, [30, 100]);
  assert.match(calls[0].sql, /r.status='reserved'/);
  assert.match(calls[0].sql, /ORDER BY r.created_at ASC/);
  assert.doesNotMatch(calls[0].sql, /UPDATE|DELETE|INSERT/);
});

test('reconciliation queue rejects invalid filter before querying database', async () => {
  let queried = false;
  const pool = { query: async () => { queried = true; throw new Error('UNEXPECTED_DB_ACCESS'); } } as unknown as Pool;
  await assert.rejects(listPendingAiReservations(pool, -1), /AI_RECONCILIATION_INVALID_FILTER/);
  await assert.rejects(listPendingAiReservations(pool, 30, 501), /AI_RECONCILIATION_INVALID_FILTER/);
  assert.equal(queried, false);
});
