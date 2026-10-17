import {createBackendStartup} from './backend-startup.js';
import {waitUntil} from '@vercel/functions';
import {createBackgroundScope} from './background-tasks.js';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { bootstrapInitialAdmin } from './bootstrap-admin.js';

// Vercel overwrites x-forwarded-for at its edge. Never accept a client chain;
// standalone use falls back to the actual socket address.
export function adapterHeaders(req:IncomingMessage){
 const {'x-real-ip':ignored,...headers}=req.headers;
 return {...headers,'x-forwarded-for':adapterClientIp(req)};
}
export function adapterClientIp(req:IncomingMessage){
 const header=process.env.VERCEL==='1'?req.headers['x-forwarded-for']:undefined;
 const candidate=typeof header==='string'?header.trim():'';
 return isIP(candidate)?candidate:(req.socket.remoteAddress||'127.0.0.1');
}
const INTERNAL_PORT = 18787;
const BACKEND_BUILD = 'routing-propagation-diagnostic-v2-20260915';
const ensureBackend=createBackendStartup(async()=>{
 if(!process.env.DATABASE_URL&&process.env.POSTGRES_URL)process.env.DATABASE_URL=process.env.POSTGRES_URL;
 process.env.PORT=String(INTERNAL_PORT);
 await bootstrapInitialAdmin();
 await import('./server.js');
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if ((req.url || '').split('?')[0]==='/api/ui-diagnostic') {
      res.statusCode=404;res.setHeader('cache-control','no-store');res.end();return;
    }
    if ((req.url || '').startsWith('/health/database')) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-media-backend-build', BACKEND_BUILD);
      res.end(JSON.stringify({ error: 'NOT_FOUND', backendBuild: BACKEND_BUILD }));
      return;
    }

    if ((req.url || '').startsWith('/api/runtime-build')) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store, no-cache, must-revalidate');
      res.setHeader('x-media-backend-build', BACKEND_BUILD);
      res.end(JSON.stringify({ ok: true, backendBuild: BACKEND_BUILD }));
      return;
    }

    await ensureBackend();

    const background=createBackgroundScope();
    try{await new Promise<void>((resolve, reject) => {
      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: INTERNAL_PORT,
          path: req.url || '/',
          method: req.method,
          headers: {...adapterHeaders(req),'x-mi-background-scope':background.id},
        },
        (proxyRes) => {
          res.statusCode = proxyRes.statusCode || 500;
          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) res.setHeader(key, value as string | string[]);
          }
          res.setHeader('x-media-backend-build', BACKEND_BUILD);
          proxyRes.on('error', reject);
          proxyRes.on('end', resolve);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on('error', reject);
      req.on('error', reject);
      req.pipe(proxyReq);
    });}finally{waitUntil(background.finish());}
  } catch (error) {
    console.error('Vercel Fastify adapter failed', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('x-media-backend-build', BACKEND_BUILD);
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'BACKEND_STARTUP_FAILED', backendBuild: BACKEND_BUILD }));
    }
  }
}
