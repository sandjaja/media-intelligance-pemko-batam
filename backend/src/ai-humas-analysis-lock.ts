import type { Pool } from 'pg';

/** Transaction locks also work through Neon's transaction-mode pooler. */
export async function withHumasAnalysisLock<T>(pool: Pool, key: string, run: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try {
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(78016,hashtext($1)) AS acquired', [key]);
    if (lock.rows[0]?.acquired !== true) throw new Error('AI_ANALYSIS_ALREADY_RUNNING');
    return await run();
  } finally {
    // No writes use this connection. ROLLBACK releases the lock on success or failure.
    try { await client.query('ROLLBACK'); } catch { destroy = true; }
    client.release(destroy);
  }
}
