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
