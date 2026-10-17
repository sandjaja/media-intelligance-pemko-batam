import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash,timingSafeEqual } from 'node:crypto';
import { readFile,access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { trustedProxy } from './trusted-proxy.js';
import { assertEmptyDatabase,completeInstall,installInput,installConfigPath } from './install-service.js';
import { checkLocalStorage } from './private-storage.js';
export function validInstallToken(actual:unknown,expected:string|undefined){
  if(typeof actual!=='string'||!expected||expected.length<32||actual.length>256)return false;
  const hash=(s:string)=>createHash('sha256').update(s).digest();return timingSafeEqual(hash(actual),hash(expected));
}
export async function createInstallServer(onComplete:()=>void=()=>undefined){
  if(process.env.VERCEL||process.env.DEPLOYMENT_MODE!=='vps'||process.env.INSTALL_ENABLED!=='true'||!process.env.INSTALL_TOKEN||process.env.INSTALL_TOKEN.length<32)throw Error('INSTALLER_DISABLED');
  for(const name of ['JWT_SECRET','INTEGRATION_CREDENTIAL_KEY','PUBLIC_APP_URL'])if(!process.env[name])throw Error('INSTALL_ENV_MISSING');
  const origin=new URL(process.env.PUBLIC_APP_URL!).origin;
  if(!origin.startsWith('https://')&&process.env.INSTALL_ALLOW_HTTP_LOCAL!=='true')throw Error('INSTALL_HTTPS_REQUIRED');
  const app=Fastify({logger:{redact:['req.headers.authorization','req.headers["x-install-token"]','req.headers.cookie']},trustProxy:trustedProxy,bodyLimit:16000});
  await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'"],connectSrc:["'self'"],imgSrc:["'self'","data:"],formAction:["'self'"],frameAncestors:["'none'"]}}});
  await app.register(rateLimit,{max:20,timeWindow:'15 minutes'});
  let busy=false,locked=false;
  app.addHook('onSend',async(_r,p,payload)=>{p.header('Cache-Control','no-store');p.header('Referrer-Policy','no-referrer');return payload});
  app.get('/health',async()=>({ok:true,service:'media-intelligence-installer'}));
  for(const [url,name,type] of [['/install','index.html','text/html'],['/install/','index.html','text/html'],['/install/app.js','app.js','text/javascript'],['/install/style.css','style.css','text/css']]){
    app.get(url,async(_r,p)=>p.type(type).send(await readFile(new URL('../install/'+name,import.meta.url),'utf8')));
  }
  app.get('/',async(_r,p)=>p.redirect('/install'));
  app.addHook('preValidation',async(r,p)=>{
    if(!r.url.startsWith('/api/install/'))return;
    if(locked)return p.code(410).send({error:'INSTALL_LOCKED'});
    try{await access(installConfigPath());return p.code(410).send({error:'INSTALL_LOCKED'})}catch(e:any){if(e.code!=='ENOENT')return p.code(503).send({error:'INSTALL_STATE_UNAVAILABLE'})}
    if(!validInstallToken(r.headers['x-install-token'],process.env.INSTALL_TOKEN))return p.code(401).send({error:'INSTALL_TOKEN_INVALID'});
    if(r.headers.origin!==origin)return p.code(403).send({error:'INSTALL_ORIGIN_INVALID'});
  });
  const withDatabase=async(body:unknown,action:(pool:Pool)=>Promise<unknown>)=>{
    const parsed=installInput.safeParse(body);if(!parsed.success)return {invalid:true};
    const pool=new Pool({connectionString:parsed.data.databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:120000});
    try{return await action(pool)}finally{await pool.end()}
  };
  app.post('/api/install/check',async(r,p)=>{
    try{const result=await withDatabase(r.body,async pool=>{await assertEmptyDatabase(pool);await checkLocalStorage();return{ok:true,database:'EMPTY',storage:'READY',identitySource:'DATA_WILAYAH',schedulerEnabled:false}});return (result as any)?.invalid?p.code(400).send({error:'INSTALL_INPUT_INVALID'}):result}
    catch(e:any){return p.code(e.message==='DATABASE_NOT_EMPTY'?409:503).send({error:e.message==='DATABASE_NOT_EMPTY'?'DATABASE_NOT_EMPTY':'INSTALL_CHECK_FAILED'})}
  });
  app.post('/api/install/complete',async(r,p)=>{
    if(busy)return p.code(409).send({error:'INSTALL_BUSY'});busy=true;
    try{
      const result=await withDatabase(r.body,async pool=>{await checkLocalStorage();await completeInstall(pool,installInput.parse(r.body));return{ok:true,loginUrl:'/',identitySettings:'Data Wilayah',schedulerEnabled:false}});
      if((result as any)?.invalid)return p.code(400).send({error:'INSTALL_INPUT_INVALID'});
      locked=true;
      // Let the browser receive success before restarting into the normal app.
      const timer=setTimeout(onComplete,1500);timer.unref();return result;
    }catch(e:any){r.log.error({code:e.code||'INSTALL_FAILED'},'Installation failed; credentials redacted');return p.code(e.message==='DATABASE_NOT_EMPTY'?409:503).send({error:e.message==='DATABASE_NOT_EMPTY'?'DATABASE_NOT_EMPTY':'INSTALL_FAILED'})}
    finally{busy=false}
  });
  return app;
}
export async function startInstaller(){
  const app=await createInstallServer(()=>{void app.close().then(()=>process.exit(0))});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0))});
  await app.listen({port:Number(process.env.PORT||8080),host:process.env.HOST||'127.0.0.1'});
}
