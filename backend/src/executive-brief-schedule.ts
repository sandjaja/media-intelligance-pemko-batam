import type { Pool } from 'pg';

export type ExecutiveBriefSchedule = {
  enabled: boolean;
  hour_wib: number;
  minute_wib: number;
  timezone: 'Asia/Jakarta';
  updated_at?: string;
};

/** Configuration-only API: no cron registration and no AI request. */
export async function readExecutiveBriefSchedule(pool: Pick<Pool, 'query'>): Promise<ExecutiveBriefSchedule> {
  const { rows } = await pool.query(
    'SELECT enabled,hour_wib,minute_wib,timezone,updated_at FROM executive_brief_schedule_settings WHERE id=1',
  );
  return rows[0] ?? { enabled: false, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' };
}

export async function saveExecutiveBriefScheduleTime(
  pool: Pick<Pool, 'query'>, hour: number, minute: number,
): Promise<ExecutiveBriefSchedule> {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('INVALID_SCHEDULE_TIME');
  }
  const { rows } = await pool.query(
    `UPDATE executive_brief_schedule_settings
     SET hour_wib=$1,minute_wib=$2,enabled=FALSE,updated_at=now()
     WHERE id=1
     RETURNING enabled,hour_wib,minute_wib,timezone,updated_at`,
    [hour, minute],
  );
  if (!rows[0]) throw new Error('EXECUTIVE_BRIEF_SCHEDULE_MISSING');
  return rows[0];
}

/** Pure scheduler decision: never triggers network, AI, or DB writes. */
export function isExecutiveBriefDue(schedule: ExecutiveBriefSchedule, now: Date): boolean {
  if (!schedule.enabled || !Number.isFinite(now.getTime())) return false;
  if (!Number.isInteger(schedule.hour_wib) || !Number.isInteger(schedule.minute_wib)) return false;
  if (schedule.hour_wib < 0 || schedule.hour_wib > 23 ||
      schedule.minute_wib < 0 || schedule.minute_wib > 59 ||
      schedule.timezone !== 'Asia/Jakarta') return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  const minute = Number(parts.find(p => p.type === 'minute')?.value);
  // Allow a delayed cron tick within ten minutes of the configured WIB time.
  // The daily database claim remains the final duplicate-execution guard.
  const scheduledMinute = schedule.hour_wib * 60 + schedule.minute_wib;
  const currentMinute = hour * 60 + minute;
  return currentMinute >= scheduledMinute && currentMinute < scheduledMinute + 10;
}

/** Date used for daily deduplication is always derived from WIB, never server UTC. */
export function executiveBriefDateWib(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new Error('INVALID_SCHEDULE_NOW');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export type ExecutiveBriefScheduleDecision = {
  due: boolean;
  date: string;
  reason: 'disabled' | 'not_due' | 'already_recorded' | 'due';
};

/** Read-only preflight. A due result does not authorize execution by itself. */
export async function inspectExecutiveBriefSchedule(
  pool: Pick<Pool, 'query'>, now: Date,
): Promise<ExecutiveBriefScheduleDecision> {
  const schedule = await readExecutiveBriefSchedule(pool);
  const date = executiveBriefDateWib(now);
  if (!schedule.enabled) return { due: false, date, reason: 'disabled' };
  if (!isExecutiveBriefDue(schedule, now)) return { due: false, date, reason: 'not_due' };
  const { rows } = await pool.query(
    'SELECT status FROM executive_brief_daily_cache WHERE brief_date=$1::date AND scope_key=$2 LIMIT 1',
    [date, 'city'],
  );
  if (rows.length) return { due: false, date, reason: 'already_recorded' };
  return { due: true, date, reason: 'due' };
}

/** Explicit opt-in. Caller must verify that a real clock trigger is available first. */
export async function enableExecutiveBriefSchedule(pool: Pick<Pool, 'query'>): Promise<ExecutiveBriefSchedule> {
  const { rows } = await pool.query(
    `UPDATE executive_brief_schedule_settings
     SET enabled=TRUE,updated_at=now() WHERE id=1 AND timezone='Asia/Jakarta'
     RETURNING enabled,hour_wib,minute_wib,timezone,updated_at`,
  );
  if (!rows[0]) throw new Error('EXECUTIVE_BRIEF_SCHEDULE_MISSING');
  return rows[0];
}

/** Disabling is always allowed, even if the cron trigger is unavailable. */
export async function disableExecutiveBriefSchedule(pool: Pick<Pool, 'query'>): Promise<ExecutiveBriefSchedule> {
  const { rows } = await pool.query(
    `UPDATE executive_brief_schedule_settings
     SET enabled=FALSE,updated_at=now() WHERE id=1
     RETURNING enabled,hour_wib,minute_wib,timezone,updated_at`,
  );
  if (!rows[0]) throw new Error('EXECUTIVE_BRIEF_SCHEDULE_MISSING');
  return rows[0];
}
