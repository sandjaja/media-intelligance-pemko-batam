import argon2 from 'argon2';
import { Pool } from 'pg';

export async function bootstrapInitialAdmin() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  const password = process.env.ADMIN_PASSWORD;
  if (!databaseUrl || !password) return;

  const email = (process.env.ADMIN_EMAIL ?? 'admin@pemko.go.id').trim().toLowerCase();
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    if (Number(countRows[0]?.count ?? 0) > 0) return;

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await pool.query('BEGIN');

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, active)
       VALUES ($1, $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role = 'admin',
             active = true
       RETURNING id,email`,
      [email, passwordHash],
    );

    const adminId = rows[0].id;
    await pool.query(
      `INSERT INTO user_roles(user_id, role_id, opd_id)
       SELECT $1, r.id, NULL
       FROM roles r
       WHERE r.code='super_admin'
       ON CONFLICT DO NOTHING`,
      [adminId],
    );

    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata)
       VALUES($1,'ADMIN_BOOTSTRAPPED',$2)`,
      [adminId, { email, source: 'vercel-startup' }],
    );

    await pool.query('COMMIT');
    console.log(`Initial super admin bootstrapped for ${email}`);
  } catch (error) {
    await pool.query('ROLLBACK').catch(() => undefined);
    console.error('Initial admin bootstrap failed', error);
    throw error;
  } finally {
    await pool.end();
  }
}
