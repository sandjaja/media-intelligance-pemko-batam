import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
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
