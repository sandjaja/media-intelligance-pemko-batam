import 'dotenv/config';
import argon2 from 'argon2';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL or POSTGRES_URL is required');

const email = (process.env.ADMIN_EMAIL ?? 'admin@pemko.go.id').trim().toLowerCase();
const configuredPassword = process.env.ADMIN_PASSWORD;
const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

if (isProduction && !configuredPassword) {
  throw new Error('ADMIN_PASSWORD is required when seeding a production database');
}

// Development-only bootstrap fallback. Production must always provide ADMIN_PASSWORD.
const developmentBootstrapPassword = 'ChangeMe-Local-Only-2026!';
const password = configuredPassword ?? developmentBootstrapPassword;
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query('BEGIN');

  const migrationCheck = await pool.query(
    `SELECT to_regclass('public.schema_migrations') AS migrations,
            to_regclass('public.users') AS users,
            to_regclass('public.roles') AS roles`
  );
  const state = migrationCheck.rows[0];
  if (!state?.migrations || !state?.users || !state?.roles) {
    throw new Error('Database foundation is not migrated. Run npm run db:migrate before db:seed.');
  }

  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, role, active)
     VALUES ($1, $2, 'admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin',
           active = true
     RETURNING id,email`,
    [email, passwordHash]
  );

  const adminId = rows[0].id;
  await pool.query(
    `INSERT INTO user_roles(user_id, role_id, opd_id)
     SELECT $1, r.id, NULL
     FROM roles r
     WHERE r.code='super_admin'
     ON CONFLICT DO NOTHING`,
    [adminId]
  );

  await pool.query(
    `INSERT INTO audit_logs(user_id,action,metadata)
     VALUES($1,'ADMIN_SEEDED',$2)`,
    [adminId, { email, production: isProduction }]
  );

  await pool.query('COMMIT');
  console.log(`Database seed complete. Admin account: ${email}`);
  console.log(configuredPassword
    ? 'Admin password was supplied through ADMIN_PASSWORD and hashed with Argon2id.'
    : 'Development bootstrap password used. Set ADMIN_PASSWORD before any production seed.');
} catch (error) {
  await pool.query('ROLLBACK').catch(() => undefined);
  console.error('Database seed failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
