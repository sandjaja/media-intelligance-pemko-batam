import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import type { Pool as PoolType } from 'pg';
import { runScheduledExecutiveBrief, executeAuthorizedExecutiveBrief } from './executive-brief-runner.js';

export const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
export const config = { maxDuration: 60 };

export function isAuthorizedExecutiveBriefCron(method: string | undefined, authorization: string | undefined, secret: string | undefined): boolean {
  return method === 'GET' && !!secret && authorization === `Bearer ${secret}`;
}

export async function runLiveScheduledExecutiveBrief(pool:PoolType,now:Date,execute=executeAuthorizedExecutiveBrief){
    // Never run the brief independently of the main collection scheduler.
    const { rows } = await pool.query(
      "SELECT enabled, run_time FROM collection_scheduler_config WHERE id=1",
    );
    const main = rows[0];
    if (!main?.enabled) return { status: 'disabled', reason: 'MAIN_SCHEDULER_DISABLED' };
    if (String(main.run_time).slice(0,5) !== '08:00') {
      return { status: 'not_due', reason: 'MAIN_SCHEDULER_TIME_MISMATCH' };
    }
    // Read the available final snapshot even if a collector is partial/running.
    // Its status is attached to the saved brief; never trigger collection here.
    return runScheduledExecutiveBrief(pool, now, {
      dryRun: false, execute,
    });
}

/**
 * Authenticated scheduler entrypoint. Execution is gated by the database schedule,
 * with a single daily claim before any AI call. No automatic registration here.
 */
export function createExecutiveBriefCronHandler(dependencies: {
  createPool: (databaseUrl: string) => Pick<PoolType, 'query' | 'end'>;
  runDryRun: (pool: PoolType, now: Date) => Promise<unknown>;
  runLive?: (pool: PoolType, now: Date) => Promise<unknown>;
} = {
  createPool: databaseUrl => new Pool({ connectionString: databaseUrl, max: 1 }),
  runDryRun: (pool, now) => runScheduledExecutiveBrief(pool, now, { dryRun: true }),
  runLive: runLiveScheduledExecutiveBrief,
}) {
return async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const secret = process.env.CRON_SECRET;
  if (!isAuthorizedExecutiveBriefCron(req.method, req.headers.authorization, secret)) {
    return json(res, 401, { error: 'UNAUTHORIZED' });
  }
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  if (!databaseUrl) return json(res, 503, { error: 'DATABASE_URL_REQUIRED' });
  const pool = dependencies.createPool(databaseUrl);
  try {
    const now = new Date();
    const result = dependencies.runLive
      ? await dependencies.runLive(pool as PoolType, now)
      : await dependencies.runDryRun(pool as PoolType, now);
    return json(res, 200, { data: result, scheduler_connected: !!dependencies.runLive });
  } catch {
    return json(res, 503, { error: 'EXECUTIVE_BRIEF_CRON_FAILED' });
  } finally {
    await pool.end();
  }
};
}

export default createExecutiveBriefCronHandler();
