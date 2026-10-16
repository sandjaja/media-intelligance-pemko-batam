import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { runScheduledExecutiveBrief } from './executive-brief-runner.js';

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
};
export const config = { maxDuration: 30 };

/**
 * Authenticated CRON preflight ONLY.
 * No automatic registration and no Gemini call; production-safe while disabled.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { error: 'UNAUTHORIZED' });
  }
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  if (!databaseUrl) return json(res, 503, { error: 'DATABASE_URL_REQUIRED' });
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await runScheduledExecutiveBrief(pool, new Date(), { dryRun: true });
    return json(res, 200, { data: result, scheduler_connected: false });
  } catch {
    return json(res, 503, { error: 'EXECUTIVE_BRIEF_CRON_PREFLIGHT_FAILED' });
  } finally {
    await pool.end();
  }
}
