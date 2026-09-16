import 'dotenv/config';
import pg from 'pg';
import { ingestEnabledSources } from './ingestion.js';

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  const result = await ingestEnabledSources(pool);
  console.log(JSON.stringify({ ok: true, results: result }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
