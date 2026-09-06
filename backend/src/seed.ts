import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import argon2 from 'argon2';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const email = (process.env.ADMIN_EMAIL ?? 'admin@pemko.go.id').trim().toLowerCase();
const defaultPasswordHash = '$argon2id$v=19$m=65536,t=3,p=4$tepMpLF24U4LMg1WWD+5GA$gi0NNGLxxhe5jfHV+mSArggmN4oJKYsooLd1UhdBVKA';
const configuredPassword = process.env.ADMIN_PASSWORD;
const passwordHash = configuredPassword
  ? await argon2.hash(configuredPassword, { type: argon2.argon2id })
  : defaultPasswordHash;

const pool = new Pool({ connectionString: databaseUrl });

try {
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  const schema = await readFile(schemaPath, 'utf8');

  await pool.query('BEGIN');
  await pool.query(schema);
  await pool.query(
    `INSERT INTO users (email, password_hash, role, active)
     VALUES ($1, $2, 'admin', true)
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', active = true`,
    [email, passwordHash]
  );
  await pool.query('COMMIT');

  console.log(`Database ready. Admin account: ${email}`);
  if (configuredPassword) {
    console.log('Admin password was taken from ADMIN_PASSWORD and hashed with Argon2id.');
  } else {
    console.log('Admin password is the documented V2 bootstrap password. Set ADMIN_PASSWORD to choose a different password.');
  }
} catch (error) {
  await pool.query('ROLLBACK').catch(() => undefined);
  console.error('Database seed failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
