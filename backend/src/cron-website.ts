import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { collectOwnedWebsiteAccount } from './website-collector.js';

const json = (res: ServerResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
};

type WebsiteRow = { id: string; account_name: string };

type SyncResult = {
  accountId: number;
  accountName: string;
  ok: boolean;
  fetched?: number;
  succeeded?: number;
  failed?: number;
  mode?: string;
  error?: string;
};

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { error: 'UNAUTHORIZED' });
  }

  if (process.env.WEBSITE_CRON_ENABLED !== 'true') {
    return json(res, 200, { ok: true, enabled: false, message: 'Website auto-sync is disabled.' });
  }

  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  if (!databaseUrl) return json(res, 503, { error: 'DATABASE_URL_MISSING' });

  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const startedAt = Date.now();

  try {
    const { rows } = await pool.query<WebsiteRow>(
      `SELECT id, account_name
         FROM owned_social_accounts
        WHERE platform='website'
          AND active=true
          AND profile_url IS NOT NULL
        ORDER BY id ASC
        LIMIT 20`,
    );

    const results = await runWithConcurrency(rows, 2, async (row): Promise<SyncResult> => {
      const accountId = Number(row.id);
      try {
        const result = await collectOwnedWebsiteAccount(pool, accountId);
        return {
          accountId,
          accountName: row.account_name,
          ok: result.failed === 0,
          fetched: result.fetched,
          succeeded: result.succeeded,
          failed: result.failed,
          mode: result.mode,
        };
      } catch (error) {
        return {
          accountId,
          accountName: row.account_name,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const summary = {
      enabled: true,
      accounts: rows.length,
      succeededAccounts: results.filter(r => r.ok).length,
      failedAccounts: results.filter(r => !r.ok).length,
      fetched: results.reduce((sum, r) => sum + Number(r.fetched ?? 0), 0),
      succeeded: results.reduce((sum, r) => sum + Number(r.succeeded ?? 0), 0),
      failed: results.reduce((sum, r) => sum + Number(r.failed ?? 0), 0),
      durationMs: Date.now() - startedAt,
      results,
    };

    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata) VALUES(NULL,'WEBSITE_AUTO_SYNC',$1::jsonb)`,
      [JSON.stringify(summary)],
    );

    return json(res, summary.failedAccounts ? 207 : 200, { ok: summary.failedAccounts === 0, data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES(NULL,'WEBSITE_AUTO_SYNC_FAILED',$1::jsonb)`,
        [JSON.stringify({ message, durationMs: Date.now() - startedAt })],
      );
    } catch {
      // Preserve original failure.
    }
    return json(res, 500, { error: 'WEBSITE_AUTO_SYNC_FAILED', message });
  } finally {
    await pool.end();
  }
}
