import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { h1Fingerprint, inboxContextFingerprint, selectYesterdayWibEvidence, claimIssueLinkageH1Batch, finishIssueLinkageH1Batch } from './issue-linkage-h1-batch-lock.js';

test('H-1 fingerprint is independent of evidence ordering and duplicate refs', () => {
  const a = [{ sourceType: 'online' as const, id: 7 }, { sourceType: 'social' as const, id: 3 }];
  assert.equal(h1Fingerprint(a), h1Fingerprint([a[1], a[0], a[1]]));
  assert.notEqual(h1Fingerprint(a), h1Fingerprint([a[0]]));
});

test('H-1 batch claim only succeeds once for the same fingerprint', async () => {
  let claimed = false;
  const pool = { query: async (sql: string) => {
    if (sql.includes('INSERT INTO issue_linkage_h1_batches')) {
      if (claimed) return { rows: [], rowCount: 0 };
      claimed = true;
      return { rows: [{ id: 41 }], rowCount: 1 };
    }
    return { rows: [{ id: 41, status: 'running' }], rowCount: 1 };
  } } as unknown as Pool;
  const first = await claimIssueLinkageH1Batch(pool, 1, '2026-10-15', 'abc', 12);
  const second = await claimIssueLinkageH1Batch(pool, 1, '2026-10-15', 'abc', 12);
  assert.deepEqual(first, { claimed: true, id: 41, status: 'running' });
  assert.deepEqual(second, { claimed: false, id: 41, status: 'running' });
});

test('H-1 batch completion requires a running status', async () => {
  const pool = { query: async (_sql: string, args: unknown[]) => ({
    rows: args[1] === 'completed' ? [{ id: 41 }] : [],
    rowCount: args[1] === 'completed' ? 1 : 0,
  }) } as unknown as Pool;
  assert.equal(await finishIssueLinkageH1Batch(pool, 41, 'completed', 2), true);
  assert.equal(await finishIssueLinkageH1Batch(pool, 41, 'failed', 2), false);
});

test('inbox cache fingerprint includes normalized keyword and sorted evidence refs', () => {
  assert.equal(inboxContextFingerprint(' Sampah! ', [
    { sourceType: 'social', id: 4 }, { sourceType: 'online', id: 2 },
  ]), 'sampah|online:2|social:4');
  assert.notEqual(inboxContextFingerprint('Sampah', [{ sourceType: 'online', id: 2 }]),
    h1Fingerprint([{ sourceType: 'online', id: 2 }]));
});

test('H-1 selection uses WIB publication date, not ingestion date, and deduplicates', () => {
  const now = new Date('2026-10-16T04:00:00Z');
  const yesterday = { sourceType: 'online' as const, id: 8, occurredAt: '2026-10-15T16:59:00Z' };
  const today = { sourceType: 'social' as const, id: 9, occurredAt: '2026-10-15T17:01:00Z' };
  const missing = { sourceType: 'print' as const, id: 10, occurredAt: null };
  const result = selectYesterdayWibEvidence([yesterday, today, missing, yesterday], now);
  assert.equal(result.date, '2026-10-15');
  assert.deepEqual(result.evidence, [yesterday]);
});
