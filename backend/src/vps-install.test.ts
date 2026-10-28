import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import argon2 from 'argon2';
import {initializeEmptyDatabase,installInput,assertEmptyDatabase,completeInstall} from './install-service.js';
import {put,get,del,checkLocalStorage} from './private-storage.js';
import {createInstallServer,validInstallToken} from './install-server.js';
import {trustedProxy} from './trusted-proxy.js';
import {registerVpsRuntime} from './vps-runtime.js';
import Fastify from 'fastify';
const input=installInput.parse({databaseUrl:'postgresql://test:test@127.0.0.1:5432/offline_only',email:'New@Example.test',password:'New-Test-Password-2026!',confirmPassword:'New-Test-Password-2026!',acceptEmptyDatabase:true});
function client(db:PGlite){return{query:async(sql:string,values?:any[])=>{if(values?.length)return db.query(sql,values);const results=await db.exec(sql);return results.at(-1)||{rows:[]}}}}
test('fresh install builds actual PostgreSQL schema and defaults without tenant data; rollback and second install are safe',async()=>{
 const db=new PGlite(),c=client(db);
 try{
  await c.query('BEGIN');await initializeEmptyDatabase(c,input,'offline-nonce');
  assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM users')).rows[0].count,1);
  const u=(await db.query<any>('SELECT email,password_hash FROM users')).rows[0];assert.equal(u.email,'new@example.test');assert(await argon2.verify(u.password_hash,input.password));
  assert.equal((await db.query<any>('SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id')).rows[0].code,'super_admin');
  assert.equal((await db.query<any>('SELECT enabled FROM collection_scheduler_config')).rows[0].enabled,false);
  assert.equal((await db.query<any>('SELECT enabled FROM executive_brief_schedule_settings')).rows[0].enabled,false);
  assert.equal((await db.query<any>('SELECT government_name FROM government_branding WHERE is_active=true')).rows[0].government_name,'Pemerintah Daerah');
  for(const table of ['articles','issues','districts','media_sources','integration_credentials','ai_provider_credentials','user_notification_channels'])assert.equal((await db.query<any>(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count,0,table+' must be empty');
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM opd')).rows[0].count,45);
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM keywords')).rows[0].count,603);
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM keyword_opd')).rows[0].count,627);
  assert.equal((await db.query<any>("SELECT count(*)::int AS count FROM keywords WHERE keyword ~* '(batam|amsakar|claudia)' OR district_id IS NOT NULL")).rows[0].count,0);
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM ai_humas_task_prompts')).rows[0].count,5);
  assert.equal((await db.query<any>('SELECT count(*)::int AS count FROM ai_providers WHERE enabled=true')).rows[0].count,0);
  await assert.rejects(assertEmptyDatabase(c),/DATABASE_NOT_EMPTY/);
  await c.query('ROLLBACK');await assertEmptyDatabase(c);
  await c.query('BEGIN');await initializeEmptyDatabase(c,input,'offline-nonce');await c.query('COMMIT');
  await assert.rejects(initializeEmptyDatabase(c,input,'new-nonce'),/DATABASE_NOT_EMPTY/);
 }finally{await db.close()}
});
test('private local storage roundtrips, removes files and rejects traversal',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mi-storage-')),before={...process.env};
 process.env.STORAGE_DRIVER='local';process.env.LOCAL_STORAGE_PATH=dir;
 try{
  await checkLocalStorage();const a=await put('evidence/example.pdf',Buffer.from('test-pdf'),{access:'private',contentType:'application/pdf'});
  assert(a.pathname.startsWith('local:'));const b=await get(a.pathname,{access:'private'});assert(b);assert.equal(await new Response(b.stream).text(),'test-pdf');assert.equal(b.blob.contentType,'application/pdf');
  await del(a.pathname);assert.equal(await get(a.pathname,{access:'private'}),null);
  for(const key of ['../secret','/etc/passwd','folder/../secret','https://example.com/key','a\\b'])await assert.rejects(put(key,'bad',{access:'private'}),/INVALID_STORAGE_KEY/);
 }finally{process.env=before;await rm(dir,{recursive:true,force:true})}
});
test('installer is disabled by default, authenticates before DB access, checks origin and serves a self contained wizard',async()=>{
 const before={...process.env},dir=await mkdtemp(join(tmpdir(),'mi-install-'));
 try{
  delete process.env.DEPLOYMENT_MODE;await assert.rejects(createInstallServer(),/INSTALLER_DISABLED/);
  Object.assign(process.env,{DEPLOYMENT_MODE:'vps',INSTALL_ENABLED:'true',INSTALL_TOKEN:'x'.repeat(64),JWT_SECRET:'j'.repeat(64),INTEGRATION_CREDENTIAL_KEY:'k'.repeat(64),PUBLIC_APP_URL:'https://install.example.test',INSTALL_CONFIG_PATH:join(dir,'runtime.json')});delete process.env.VERCEL;
  const app=await createInstallServer();
  try{
   const page=await app.inject('/install');assert.equal(page.statusCode,200);assert.match(page.body,/Data Wilayah/);assert(!page.body.includes('cdn.'));assert.match(page.headers['content-security-policy'] as string,/frame-ancestors 'none'/);
   assert.equal((await app.inject({method:'POST',url:'/api/install/complete',payload:input})).statusCode,401);
   assert.equal((await app.inject({method:'POST',url:'/api/install/complete',headers:{'x-install-token':'x'.repeat(64),origin:'https://evil.example'},payload:input})).statusCode,403);
   assert.equal((await app.inject({method:'POST',url:'/api/install/complete',headers:{'x-install-token':'x'.repeat(64),origin:'https://install.example.test'},payload:{...input,password:'short'}})).statusCode,400);
  }finally{await app.close()}
 }finally{process.env=before;await rm(dir,{recursive:true,force:true})}
 assert(validInstallToken('a'.repeat(64),'a'.repeat(64)));assert(!validInstallToken('wrong','a'.repeat(64)));assert(!installInput.safeParse({...input,databaseUrl:'https://wrong.test'}).success);
});
test('VPS proxy trusts only the first local hop; cron/callback routes preserve authentication',async()=>{
 const before={...process.env};Object.assign(process.env,{DEPLOYMENT_MODE:'vps',TRUST_LOCAL_PROXY:'true'});delete process.env.VERCEL;delete process.env.CRON_SECRET;
 try{
  assert(trustedProxy('127.0.0.1',0));assert(!trustedProxy('198.51.100.9',0));assert(!trustedProxy('127.0.0.1',1));
  const app=Fastify();await registerVpsRuntime(app,{query:async()=>{throw Error('DB unavailable')}} as any);
  try{for(const url of ['/api/cron/collection','/api/cron/executive-brief'])assert.equal((await app.inject(url)).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/api/cron/apify-complete'})).statusCode,401);assert.equal((await app.inject('/ready')).statusCode,503);assert.equal((await app.inject('/install')).statusCode,410)}finally{await app.close()}
 }finally{process.env=before}
});
test('installation commits once, persists mode 0600 config and locks the HTTP installer',async()=>{
 const db=new PGlite(),c=client(db),before={...process.env},dir=await mkdtemp(join(tmpdir(),'mi-install-final-')),path=join(dir,'runtime.json');
 const pool={connect:async()=>({...c,release:()=>undefined})} as any;
 try{
  await completeInstall(pool,input,path);
  const config=JSON.parse(await readFile(path,'utf8'));assert.equal(config.databaseUrl,input.databaseUrl);assert.equal(config.version,1);assert.equal((await stat(path)).mode&0o777,0o600);
  assert.equal((await db.query<any>('SELECT instance_id FROM app_installation')).rows[0].instance_id,config.instanceId);
  await assert.rejects(completeInstall(pool,input,path),/DATABASE_NOT_EMPTY/);
  assert.equal(JSON.parse(await readFile(path,'utf8')).instanceId,config.instanceId);
  Object.assign(process.env,{DEPLOYMENT_MODE:'vps',INSTALL_ENABLED:'true',INSTALL_TOKEN:'x'.repeat(64),JWT_SECRET:'j'.repeat(64),INTEGRATION_CREDENTIAL_KEY:'k'.repeat(64),PUBLIC_APP_URL:'https://install.example.test',INSTALL_CONFIG_PATH:path});delete process.env.VERCEL;
  const app=await createInstallServer();try{assert.equal((await app.inject({method:'POST',url:'/api/install/complete',headers:{origin:'https://install.example.test','x-install-token':'x'.repeat(64)},payload:input})).statusCode,410)}finally{await app.close()}
 }finally{process.env=before;await db.close();await rm(dir,{recursive:true,force:true})}
});
test('migration runner removes only the outer transaction and keeps SQL function bodies',async()=>{
 const {migrationBody}=await import('./migration-sql.js');
 assert.equal(migrationBody('-- migration\nBEGIN;\nSELECT 1;\nCOMMIT;\n'),'-- migration\n\nSELECT 1;\n');
 const body='CREATE FUNCTION example() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;';assert.equal(migrationBody(body),body);
 assert.throws(()=>migrationBody('BEGIN; SELECT 1;'),/TRANSACTION_UNCLOSED/);
});
