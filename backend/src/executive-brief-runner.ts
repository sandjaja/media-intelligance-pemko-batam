import type { Pool } from 'pg';
import { inspectExecutiveBriefSchedule, type ExecutiveBriefScheduleDecision } from './executive-brief-schedule.js';
import { generateDailyExecutiveBrief } from './executive-brief-daily.js';

export type ExecutiveBriefRunnerResult = {
  date: string;
  status: 'disabled' | 'not_due' | 'already_recorded' | 'due' | 'created' | 'already_claimed' | 'failed';
  dry_run: boolean;
};

/** Only an explicit call can invoke this runner. No timers, cron registration or side effects on import. */
export async function runScheduledExecutiveBrief(
  pool: Pool,
  now: Date,
  options: { dryRun: true },
): Promise<ExecutiveBriefRunnerResult>;
export async function runScheduledExecutiveBrief(
  pool: Pool,
  now: Date,
  options: { dryRun: false; execute: (pool: Pool, date: string) => Promise<{ status: 'created' | 'already_claimed' | 'failed' }> },
): Promise<ExecutiveBriefRunnerResult>;
export async function runScheduledExecutiveBrief(
  pool: Pool,
  now: Date,
  options: { dryRun: boolean; execute?: (pool: Pool, date: string) => Promise<{ status: 'created' | 'already_claimed' | 'failed' }> },
): Promise<ExecutiveBriefRunnerResult> {
  const decision: ExecutiveBriefScheduleDecision = await inspectExecutiveBriefSchedule(pool, now);
  if (!decision.due || options.dryRun) {
    return { date: decision.date, status: decision.reason, dry_run: true };
  }
  // The database claim in generateDailyExecutiveBrief remains the atomic final guard.
  // Caller must supply the execution capability explicitly: no accidental AI call.
  if (!options.execute) throw new Error('EXECUTIVE_BRIEF_EXECUTION_NOT_AUTHORIZED');
  const result = await options.execute(pool, decision.date);
  return { date: decision.date, status: result.status, dry_run: false };
}

/** Reserved for a future authenticated cron entrypoint; not called by any route today. */
export const executeAuthorizedExecutiveBrief = generateDailyExecutiveBrief;
