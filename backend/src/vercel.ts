import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { bootstrapInitialAdmin } from './bootstrap-admin.js';

const INTERNAL_PORT = 18787;
let backendReady: Promise<void> | null = null;

async function ensureBackend() {
  if (!backendReady) {
    backendReady = (async () => {
      if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
        process.env.DATABASE_URL = process.env.POSTGRES_URL;
      }
      process.env.PORT = String(INTERNAL_PORT);
      await bootstrapInitialAdmin();
      await import('./server.js');
    })();
  }
  return backendReady;
}

async function handleDatabaseHealth(res: ServerResponse) {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '';
  if (!databaseUrl) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'DATABASE_URL_MISSING' }));
    return;
  }

  const parsed = new URL(databaseUrl);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_user AS database_user,
        (SELECT COUNT(*)::int FROM users) AS users_count,
        (SELECT COUNT(*)::int FROM roles) AS roles_count,
        (SELECT COUNT(*)::int FROM schema_migrations) AS migration_count
    `);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      host: parsed.hostname,
      database: result.rows[0]?.database_name ?? null,
      databaseUser: result.rows[0]?.database_user ?? null,
      users: Number(result.rows[0]?.users_count ?? 0),
      roles: Number(result.rows[0]?.roles_count ?? 0),
      migrations: Number(result.rows[0]?.migration_count ?? 0),
      adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD),
      jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
      vercelEnv: process.env.VERCEL_ENV ?? null,
    }));
  } catch (error) {
    console.error('Database health check failed', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: false,
      host: parsed.hostname,
      error: 'DATABASE_HEALTH_CHECK_FAILED',
    }));
  } finally {
    await pool.end();
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if ((req.url || '').startsWith('/health/database')) {
      await handleDatabaseHealth(res);
      return;
    }

    await ensureBackend();

    await new Promise<void>((resolve, reject) => {
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: INTERNAL_PORT,
          path: req.url || '/',
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.statusCode = proxyRes.statusCode || 500;
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) res.setHeader(key, value as string | string[]);
          }
          proxyRes.on('error', reject);
          proxyRes.on('end', resolve);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on('error', reject);
      req.on('error', reject);
      req.pipe(proxyReq);
    });
  } catch (error) {
    console.error('Vercel Fastify adapter failed', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'BACKEND_STARTUP_FAILED' }));
    }
  }
}
