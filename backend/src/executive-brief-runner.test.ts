import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledExecutiveBrief } from './executive-brief-runner.js';

const now = new Date('2026-10-16T23:30:00Z');
function fakePool(enabled: boolean, recorded = false) {
  let calls = 0;
  const pool = { query: async (sql: string) => {
    calls++;
    assert.match(sql, /^SELECT/);
    if (sql.includes('executive_brief_daily_cache')) return { rows: recorded ? [{ status: 'failed' }] : [] };
    return { rows: [{ enabled, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  return { pool, getCalls: () => calls };
}

test('runner dry run never invokes AI or writes to database', async () => {
  const db = fakePool(true);
  const result = await runScheduledExecutiveBrief(db.pool as never, now, { dryRun: true });
  assert.deepEqual(result, { date: '2026-10-17', status: 'due', dry_run: true });
  assert.equal(db.getCalls(), 2);
});

test('runner refuses execution when schedule is disabled', async () => {
  const db = fakePool(false);
  let invoked = false;
  const result = await runScheduledExecutiveBrief(db.pool as never, now, {
    dryRun: false, execute: async () => { invoked = true; return { status: 'created' }; },
  });
  assert.equal(result.status, 'disabled');
  assert.equal(invoked, false);
});

test('runner refuses repeated execution even if previous run failed', async () => {
  const db = fakePool(true, true);
  let invoked = false;
  const result = await runScheduledExecutiveBrief(db.pool as never, now, {
    dryRun: false, execute: async () => { invoked = true; return { status: 'created' }; },
  });
  assert.equal(result.status, 'already_recorded');
  assert.equal(invoked, false);
});

test('runner invokes supplied execution capability once when due', async () => {
  const db = fakePool(true);
  let count = 0;
  const result = await runScheduledExecutiveBrief(db.pool as never, now, {
    dryRun: false, execute: async (_pool, date) => {
      count++;
      assert.equal(date, '2026-10-17');
      return { status: 'created' };
    },
  });
  assert.equal(count, 1);
  assert.equal(result.status, 'created');
});
