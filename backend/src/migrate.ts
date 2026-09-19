import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version=$1 LIMIT 1',
      [file]
    );
    if (alreadyApplied.rowCount) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}...`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
      await pool.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Database migrations complete.');
}

main()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
