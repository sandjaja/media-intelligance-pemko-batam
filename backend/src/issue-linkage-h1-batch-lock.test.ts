import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { h1Fingerprint, h1ClassifiedPlanFingerprint, isSafeH1Group, buildH1BoundedPlan, validateH1ExecutionPlan, inboxContextFingerprint, selectYesterdayWibEvidence, groupH1Evidence, publicationDateNeedsReview, claimIssueLinkageH1Batch, claimAndReserveH1Batch, finishIssueLinkageH1Batch } from './issue-linkage-h1-batch-lock.js';

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

test('H-1 classified fingerprint changes with keyword and OPD', () => {
  const evidence = [{ sourceType: 'online' as const, id: 7 }];
  const first = h1ClassifiedPlanFingerprint([{ primaryKeyword: 'sampah', opdId: 15, evidence }]);
  assert.notEqual(first, h1ClassifiedPlanFingerprint([{ primaryKeyword: 'banjir', opdId: 15, evidence }]));
  assert.notEqual(first, h1ClassifiedPlanFingerprint([{ primaryKeyword: 'sampah', opdId: 16, evidence }]));
  assert.equal(first, h1ClassifiedPlanFingerprint([{ primaryKeyword: 'sampah', opdId: 15, evidence }]));
});

test('H-1 safety guard rejects cross-OPD evidence and oversized groups', () => {
  const good = { primaryKeyword: 'sampah', opdId: 15,
    evidence: [{ sourceType: 'online' as const, id: 1, opdId: 15 },
      { sourceType: 'social' as const, id: 2, opdId: 15 }] };
  assert.equal(isSafeH1Group(good), true);
  assert.equal(isSafeH1Group({ ...good, evidence: [good.evidence[0],
    { sourceType: 'social' as const, id: 2, opdId: 16 }] }), false);
  assert.equal(isSafeH1Group({ ...good, evidence: [good.evidence[0], good.evidence[0]] }), false);
  assert.equal(isSafeH1Group({ ...good, evidence: Array.from({ length: 41 }, (_, i) =>
    ({ sourceType: 'online' as const, id: i + 1, opdId: 15 })) }), false);
});

test('shared H-1 planner excludes date discrepancies before grouping', () => {
  const evidence = [
    { sourceType: 'online' as const, id: 1, occurredAt: '2026-10-15T04:00:00Z',
      title: 'Berita lama', summary: 'Terbit 10 Oktober 2026', primaryKeyword: 'sampah', opdId: 15 },
    { sourceType: 'online' as const, id: 2, occurredAt: '2026-10-15T04:00:00Z',
      title: 'Berita baru', summary: '', primaryKeyword: 'sampah', opdId: 15 },
    { sourceType: 'social' as const, id: 3, occurredAt: '2026-10-15T04:00:00Z',
      title: 'Berita baru', summary: '', primaryKeyword: 'sampah', opdId: 15 },
  ];
  const plan = buildH1BoundedPlan(evidence, new Date('2026-10-16T12:00:00Z'));
  assert.equal(plan.publicationDateReviewCount, 1);
  assert.equal(plan.plannedGroupCount, 1);
  assert.equal(plan.plannedGroups[0].evidence.length, 2);
});

test('H-1 different fingerprint collision reports the active batch', async () => {
  const pool = { query: async (sql: string) => {
    if (sql.includes('INSERT INTO')) return { rows: [] };
    if (sql.includes('AND fingerprint=$3')) return { rows: [] };
    return { rows: [{ id: 88 }] };
  } } as unknown as Pool;
  const result = await claimIssueLinkageH1Batch(pool, 1, '2026-10-15', 'new-fingerprint', 3);
  assert.deepEqual(result, { claimed: false, id: 88, status: 'another_batch_running' });
});

test('H-1 claim and reservation commits only after every evidence is reserved', async () => {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [{ id: 19 }], rowCount: 1 };
      if (sql.includes('INSERT INTO issue_linkage_h1_evidence_ledger')) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { queries.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15', h1Fingerprint([{ sourceType: 'online', id: 1 }, { sourceType: 'social', id: 2 }]), [
    { sourceType: 'online', id: 1 }, { sourceType: 'social', id: 2 },
  ]);
  assert.equal(result.claimed, true);
  assert.deepEqual(queries.filter(q => ['BEGIN','COMMIT','ROLLBACK','RELEASE'].includes(q)),
    ['BEGIN','COMMIT','RELEASE']);
});

test('H-1 reservation conflict rolls back batch claim', async () => {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [{ id: 19 }], rowCount: 1 };
      if (sql.includes('INSERT INTO issue_linkage_h1_evidence_ledger')) return { rows: [{ id: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { queries.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15', h1Fingerprint([{ sourceType: 'online', id: 1 }, { sourceType: 'social', id: 2 }]), [
    { sourceType: 'online', id: 1 }, { sourceType: 'social', id: 2 },
  ]);
  assert.deepEqual(result, { claimed: false, id: null, status: 'evidence_already_reserved' });
  assert.deepEqual(queries.filter(q => ['BEGIN','COMMIT','ROLLBACK','RELEASE'].includes(q)),
    ['BEGIN','ROLLBACK','RELEASE']);
});

test('H-1 transaction rolls back and releases connection on database failure', async () => {
  const steps: string[] = [];
  const client = {
    query: async (sql: string) => {
      steps.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [{ id: 71 }], rowCount: 1 };
      if (sql.includes('INSERT INTO issue_linkage_h1_evidence_ledger')) throw new Error('database_write_failed');
      return { rows: [], rowCount: 0 };
    },
    release: () => { steps.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  await assert.rejects(
    claimAndReserveH1Batch(pool, 1, '2026-10-15', h1Fingerprint([{ sourceType: 'online', id: 1 }]), [{ sourceType: 'online', id: 1 }]),
    /database_write_failed/,
  );
  assert.deepEqual(steps.filter(q => ['BEGIN','COMMIT','ROLLBACK','RELEASE'].includes(q)),
    ['BEGIN','ROLLBACK','RELEASE']);
});

test('H-1 transaction never commits an invalid duplicate evidence plan', async () => {
  const steps: string[] = [];
  const client = {
    query: async (sql: string) => {
      steps.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [{ id: 72 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { steps.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15', 'fp', [
    { sourceType: 'online', id: 1 }, { sourceType: 'online', id: 1 },
  ]);
  assert.equal(result.status, 'invalid_evidence_plan');
  assert.equal(steps.some(q => q.includes('INSERT INTO issue_linkage_h1_evidence_ledger')), false);
  assert.deepEqual(steps, []);
});

test('H-1 atomic claim accepts matching classified keyword/OPD fingerprint', async () => {
  const evidence = [{ sourceType: 'online' as const, id: 11 }, { sourceType: 'social' as const, id: 12 }];
  const groups = [{ primaryKeyword: 'sampah', opdId: 9, evidence }];
  const steps: string[] = [];
  const client = {
    query: async (sql: string) => {
      steps.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [{ id: 81 }], rowCount: 1 };
      if (sql.includes('INSERT INTO issue_linkage_h1_evidence_ledger')) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { steps.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15',
    h1ClassifiedPlanFingerprint(groups), evidence, groups);
  assert.equal(result.claimed, true);
  assert.equal(steps.includes('COMMIT'), true);
});

test('H-1 atomic claim rejects altered keyword/OPD before opening transaction', async () => {
  const evidence = [{ sourceType: 'online' as const, id: 11 }, { sourceType: 'social' as const, id: 12 }];
  const original = [{ primaryKeyword: 'sampah', opdId: 9, evidence }];
  const altered = [{ primaryKeyword: 'banjir', opdId: 10, evidence }];
  let connected = false;
  const pool = { connect: async () => { connected = true; throw new Error('unexpected_connect'); } } as unknown as Pool;
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15',
    h1ClassifiedPlanFingerprint(original), evidence, altered);
  assert.equal(result.status, 'invalid_evidence_plan');
  assert.equal(connected, false);
});


test('H-1 simulation: normalized keywords, WIB boundaries and group limit without Gemini', () => {
  const now = new Date('2026-10-16T03:00:00Z');
  const items = Array.from({ length: 7 }, (_, group) => [1, 2].map(id => ({
    sourceType: 'online' as const, id: group * 10 + id,
    occurredAt: '2026-10-15T12:00:00Z',
    primaryKeyword: `Topik ${group}`, opdId: 10,
    title: 'Berita simulasi', summary: '',
  }))).flat();
  items.push({ ...items[0], id: 99, occurredAt: '2026-10-15T17:00:00Z' });
  const plan = buildH1BoundedPlan(items, now);
  assert.equal(plan.date, '2026-10-15');
  assert.equal(plan.plannedGroupCount, 5);
  assert.equal(plan.deferredGroupCount, 2);
  assert.equal(plan.plannedGroups.every(g => g.evidence.length === 2), true);
  assert.equal(plan.planCheck.valid, true);
});

test('H-1 simulation: duplicate completed batch cannot reserve evidence or invoke AI', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes('INSERT INTO issue_linkage_h1_batches')) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id, status FROM issue_linkage_h1_batches'))
        return { rows: [{ id: 19, status: 'completed' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { statements.push('RELEASE'); },
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const evidence = [{ sourceType: 'online' as const, id: 1 }];
  const result = await claimAndReserveH1Batch(pool, 1, '2026-10-15', h1Fingerprint(evidence), evidence);
  assert.deepEqual(result, { claimed: false, id: 19, status: 'completed' });
  assert.equal(statements.some(sql => sql.includes('INSERT INTO issue_linkage_h1_evidence_ledger')), false);
  assert.deepEqual(statements.filter(sql => ['BEGIN', 'COMMIT', 'ROLLBACK', 'RELEASE'].includes(sql)),
    ['BEGIN', 'ROLLBACK', 'RELEASE']);
});


test('H-1 simulation: 41 evidence in one group is excluded rather than partially analyzed', () => {
  const items = Array.from({ length: 41 }, (_, i) => ({
    sourceType: 'online' as const, id: i + 1, occurredAt: '2026-10-15T12:00:00Z',
    primaryKeyword: 'sampah', opdId: 15, title: 'Simulasi', summary: '',
  }));
  const plan = buildH1BoundedPlan(items, new Date('2026-10-16T12:00:00Z'));
  assert.equal(plan.plannedGroupCount, 0);
  assert.equal(plan.oversizedGroupCount, 1);
  assert.equal(plan.planCheck.valid, false);
});
test('H-1 simulation: changing OPD or keyword invalidates prepared classified plan', () => {
  const evidence = [{ sourceType: 'online' as const, id: 1 }, { sourceType: 'social' as const, id: 2 }];
  const original = h1ClassifiedPlanFingerprint([{ primaryKeyword: 'sampah', opdId: 15, evidence }]);
  const modified = h1ClassifiedPlanFingerprint([{ primaryKeyword: 'banjir', opdId: 15, evidence }]);
  assert.equal(validateH1ExecutionPlan('2026-10-15', original, '2026-10-15', evidence, modified).reason, 'H1_PLAN_CHANGED');
});
