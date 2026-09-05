import 'dotenv/config';
import pg from 'pg';
import { ingestEnabledSources } from './ingestion.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await ingestEnabledSources(pool);
  console.log(JSON.stringify({ ok: true, results: result }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
