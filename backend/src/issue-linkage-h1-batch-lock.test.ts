import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { h1Fingerprint, validateH1ExecutionPlan, inboxContextFingerprint, selectYesterdayWibEvidence, groupH1Evidence, publicationDateNeedsReview, claimIssueLinkageH1Batch, finishIssueLinkageH1Batch } from './issue-linkage-h1-batch-lock.js';

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

test('H-1 grouping isolates OPDs, deduplicates and keeps missing keywords separate', () => {
  const groups = groupH1Evidence([
    { sourceType: 'online', id: 1, primaryKeyword: ' Sampah ', opdId: 4 },
    { sourceType: 'social', id: 2, primaryKeyword: 'sampah', opdId: 4 },
    { sourceType: 'print', id: 3, primaryKeyword: 'sampah', opdId: 5 },
    { sourceType: 'owned', id: 4, primaryKeyword: null, opdId: 4 },
    { sourceType: 'online', id: 1, primaryKeyword: ' Sampah ', opdId: 4 },
  ] as const);
  assert.equal(groups.length, 3);
  assert.equal(groups.find(g => g.key === 'sampah|opd:4')?.evidence.length, 2);
  assert.equal(groups.find(g => g.key === 'sampah|opd:5')?.evidence.length, 1);
  assert.equal(groups.find(g => g.key === 'unclassified|owned:4')?.evidence.length, 1);
});

test('publication-date review recognizes Indonesian dates without rewriting stored timestamps', () => {
  assert.equal(publicationDateNeedsReview('2026-10-16T09:38:53Z',
    'DPR minta investasi AI', 'Sabtu, 10 Oktober 2026 09:26 WIB'), true);
  assert.equal(publicationDateNeedsReview('2026-10-16T09:38:53Z',
    'Berita terbaru', 'Jumat, 16 Oktober 2026'), false);
  assert.equal(publicationDateNeedsReview('2026-10-16T09:38:53Z',
    'Berita terbaru', '31 Februari 2026'), false);
});

test('duplicate H-1 snapshots preserve the primary keyword and OPD', () => {
  const result = selectYesterdayWibEvidence([
    { sourceType: 'online' as const, id: 1133, occurredAt: '2026-10-15T05:00:00Z',
      primaryKeyword: 'pekerja', opdId: 15 },
    { sourceType: 'online' as const, id: 1133, occurredAt: '2026-10-15T05:00:00Z',
      primaryKeyword: null, opdId: null },
  ], new Date('2026-10-16T12:00:00Z'));
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].primaryKeyword, 'pekerja');
  assert.equal(result.evidence[0].opdId, 15);
});

test('H-1 execution rejects stale or modified plans before quota usage', () => {
  const evidence = [{ sourceType: 'online' as const, id: 7 }];
  const fingerprint = h1Fingerprint(evidence);
  assert.equal(validateH1ExecutionPlan('2026-10-15', fingerprint, '2026-10-15', evidence).valid, true);
  assert.equal(validateH1ExecutionPlan('2026-10-14', fingerprint, '2026-10-15', evidence).reason, 'H1_DATE_CHANGED');
  assert.equal(validateH1ExecutionPlan('2026-10-15', fingerprint, '2026-10-15',
    [{ sourceType: 'online', id: 8 }]).reason, 'H1_PLAN_CHANGED');
  assert.equal(validateH1ExecutionPlan('2026-10-15', h1Fingerprint([]), '2026-10-15', []).reason, 'H1_PLAN_SIZE_INVALID');
});
