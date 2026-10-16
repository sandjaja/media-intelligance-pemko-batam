import test from 'node:test';
import assert from 'node:assert/strict';
import { readExecutiveBriefSchedule, saveExecutiveBriefScheduleTime, isExecutiveBriefDue, executiveBriefDateWib, inspectExecutiveBriefSchedule, enableExecutiveBriefSchedule, disableExecutiveBriefSchedule } from './executive-brief-schedule.js';

test('schedule defaults to 06:30 WIB and disabled when no row exists', async () => {
  const db = { query: async () => ({ rows: [] }) };
  assert.deepEqual(await readExecutiveBriefSchedule(db as never), {
    enabled: false, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta',
  });
});

test('schedule update persists time while explicitly disabling execution', async () => {
  const db = { query: async (sql: string, params: unknown[]) => {
    assert.match(sql, /enabled=FALSE/);
    assert.deepEqual(params, [7, 15]);
    return { rows: [{ enabled: false, hour_wib: 7, minute_wib: 15, timezone: 'Asia/Jakarta' }] };
  } };
  const result = await saveExecutiveBriefScheduleTime(db as never, 7, 15);
  assert.equal(result.enabled, false);
  assert.equal(result.hour_wib, 7);
});

test('schedule rejects invalid time without accessing database', async () => {
  const db = { query: async () => { throw Error('unexpected DB query'); } };
  for (const [hour, minute] of [[-1, 30], [24, 0], [6, 60], [6.5, 30], [6, -1]]) {
    await assert.rejects(saveExecutiveBriefScheduleTime(db as never, hour, minute), /INVALID_SCHEDULE_TIME/);
  }
});

test('schedule fails closed if settings row is missing', async () => {
  const db = { query: async () => ({ rows: [] }) };
  await assert.rejects(saveExecutiveBriefScheduleTime(db as never, 6, 30), /EXECUTIVE_BRIEF_SCHEDULE_MISSING/);
});

test('schedule never runs while disabled, even at 06:30 WIB', () => {
  const now = new Date('2026-10-16T23:30:00Z');
  assert.equal(isExecutiveBriefDue({ enabled: false, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }, now), false);
});

test('schedule matches WIB clock, not server UTC time', () => {
  const schedule = { enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' as const };
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T23:30:00Z')), true);
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T06:30:00Z')), false);
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T23:31:00Z')), true);
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T23:39:00Z')), true);
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T23:40:00Z')), false);
});

test('schedule rejects invalid timezone and clock settings', () => {
  const now = new Date('2026-10-16T23:30:00Z');
  assert.equal(isExecutiveBriefDue({ enabled: true, hour_wib: 25, minute_wib: 30, timezone: 'Asia/Jakarta' }, now), false);
  assert.equal(isExecutiveBriefDue({ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'UTC' as 'Asia/Jakarta' }, now), false);
});

test('daily deduplication date follows WIB across UTC midnight', () => {
  assert.equal(executiveBriefDateWib(new Date('2026-10-16T23:30:00Z')), '2026-10-17');
  assert.equal(executiveBriefDateWib(new Date('2026-10-16T16:59:00Z')), '2026-10-16');
});

test('schedule preflight stays read-only and disabled by default', async () => {
  let calls = 0;
  const db = { query: async (sql: string) => {
    calls++;
    assert.match(sql, /^SELECT/);
    return { rows: [{ enabled: false, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  const decision = await inspectExecutiveBriefSchedule(db as never, new Date('2026-10-16T23:30:00Z'));
  assert.deepEqual(decision, { due: false, date: '2026-10-17', reason: 'disabled' });
  assert.equal(calls, 1);
});

test('schedule preflight refuses duplicate daily claim', async () => {
  const db = { query: async (sql: string) => {
    assert.match(sql, /^SELECT/);
    if (sql.includes('executive_brief_daily_cache')) return { rows: [{ status: 'failed' }] };
    return { rows: [{ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  const decision = await inspectExecutiveBriefSchedule(db as never, new Date('2026-10-16T23:30:00Z'));
  assert.equal(decision.reason, 'already_recorded');
  assert.equal(decision.due, false);
});

test('schedule preflight identifies due run without creating a claim', async () => {
  const db = { query: async (sql: string) => {
    assert.match(sql, /^SELECT/);
    if (sql.includes('executive_brief_daily_cache')) return { rows: [] };
    return { rows: [{ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  const decision = await inspectExecutiveBriefSchedule(db as never, new Date('2026-10-16T23:30:00Z'));
  assert.deepEqual(decision, { due: true, date: '2026-10-17', reason: 'due' });
});

test('Executive Brief activation can be safely disabled without touching collection scheduler', async () => {
  const db = { query: async (sql: string) => {
    assert.match(sql, /UPDATE executive_brief_schedule_settings/);
    assert.match(sql, /enabled=FALSE/);
    assert.doesNotMatch(sql, /collection_scheduler/);
    return { rows: [{ enabled: false, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  assert.equal((await disableExecutiveBriefSchedule(db as never)).enabled, false);
});


test('Executive Brief activation changes only its own schedule row', async () => {
  const db = { query: async (sql: string) => {
    assert.match(sql, /UPDATE executive_brief_schedule_settings/);
    assert.match(sql, /enabled=TRUE/);
    assert.match(sql, /timezone='Asia\\/Jakarta'/);
    assert.doesNotMatch(sql, /collection_scheduler/);
    return { rows: [{ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  assert.equal((await enableExecutiveBriefSchedule(db as never)).enabled, true);
});

test('Executive Brief activation fails closed when configuration is missing', async () => {
  const db = { query: async () => ({ rows: [] }) };
  await assert.rejects(enableExecutiveBriefSchedule(db as never), /EXECUTIVE_BRIEF_SCHEDULE_MISSING/);
});
