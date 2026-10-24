import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import collection from './cron-collection.js';
import brief from './cron-executive-brief.js';
import complete from './cron-apify-complete.js';
export async function registerVpsRuntime(app:FastifyInstance,pool:Pool){
  if(process.env.DEPLOYMENT_MODE!=='vps'||process.env.VERCEL)return;
  for(const [method,url,handler] of [['GET','/api/cron/collection',collection],['GET','/api/cron/executive-brief',brief],['POST','/api/cron/apify-complete',complete]] as const){
    app.route({method,url,handler:async(request,reply)=>{reply.hijack();await handler(request.raw,reply.raw)}});
  }
  app.get('/ready',async(_r,p)=>{try{await pool.query('SELECT 1');return{ok:true}}catch{return p.code(503).send({ok:false})}});
  app.get('/install',async(_r,p)=>p.code(410).type('text/html').send('<!doctype html><html lang="id"><meta name="viewport" content="width=device-width"><title>Instalasi terkunci</title><body><h1>Installer sudah dikunci.</h1><p>Instalasi baru hanya tersedia sebelum aplikasi disiapkan.</p><a href="/">Masuk aplikasi</a></body></html>'));
}
