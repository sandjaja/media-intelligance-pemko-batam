import 'dotenv/config';
import { Pool } from 'pg';
import { ingestEnabledSources } from './ingestion.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const minutes = Math.max(1, Number(process.env.RUN_INTERVAL_MINUTES ?? 30));
const pool = new Pool({ connectionString: databaseUrl, max: 5 });

async function run() {
  const startedAt = new Date().toISOString();
  const results = await ingestEnabledSources(pool);
  console.log(JSON.stringify({ startedAt, intervalMinutes: minutes, results }));
}

await run();
setInterval(() => run().catch(error => console.error('[scheduler]', error)), minutes * 60_000);
process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
process.on('SIGINT', async () => { await pool.end(); process.exit(0); });
