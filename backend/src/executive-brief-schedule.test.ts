import test from 'node:test';
import assert from 'node:assert/strict';
import { readExecutiveBriefSchedule, saveExecutiveBriefScheduleTime, isExecutiveBriefDue } from './executive-brief-schedule.js';

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
  assert.equal(isExecutiveBriefDue(schedule, new Date('2026-10-16T23:31:00Z')), false);
});

test('schedule rejects invalid timezone and clock settings', () => {
  const now = new Date('2026-10-16T23:30:00Z');
  assert.equal(isExecutiveBriefDue({ enabled: true, hour_wib: 25, minute_wib: 30, timezone: 'Asia/Jakarta' }, now), false);
  assert.equal(isExecutiveBriefDue({ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'UTC' as 'Asia/Jakarta' }, now), false);
});
