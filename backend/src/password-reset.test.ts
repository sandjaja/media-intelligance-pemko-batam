import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import {createHash} from 'node:crypto';
import {registerPasswordResetRoutes,passwordResetBaseUrl} from './password-reset-routes.js';
import {registerAuthSessionRoutes} from './auth-session-routes.js';
import {inspectExecutiveBriefRetry,claimExecutiveBriefRetry} from './executive-brief-cache.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(failMail=false, deliveryGate?:Promise<void>){
 const user={id:'1',email:'user@example.test',password_hash:await argon2.hash('initial-password')};
 let token:any=null,revoked=false,tvRevoked=false,sends=0,link='';const queries:any[]=[];
 const query=async(sql:string,params:any[]=[])=>{
  queries.push({sql,params});
  if(sql.includes('SELECT id,email,password_hash FROM users'))return {rows:params[0]===user.email?[user]:[]};
  if(sql.includes('created_at>now()'))return {rows:token?[{id:token.id}]:[]};
  if(sql.startsWith('INSERT INTO password_reset_email_tokens')){token={id:'7',user_id:params[0],token_hash:params[1],fingerprint:params[2],used:false,expired:false};return {rows:[{id:'7'}]};}
  if(sql.startsWith('SELECT u.id,u.password_hash'))return {rows:token?.token_hash===params[0]?[user]:[]};
  if(sql.startsWith('SELECT id,user_id FROM password_reset_email_tokens'))return {rows:token?.token_hash===params[0]&&!token.used&&!token.expired&&token.fingerprint===params[1]?[{id:token.id,user_id:token.user_id}]:[]};
  if(sql.startsWith('UPDATE password_reset_email_tokens')){if(token)token.used=true;}
  if(sql.startsWith('UPDATE users SET password_hash'))user.password_hash=params[1];
  if(sql.startsWith('UPDATE refresh_tokens'))revoked=true;
  if(sql.startsWith('UPDATE viewer_display_devices'))tvRevoked=true;
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})} as any;
 const app=Fastify();await app.register(cookie);await app.register(rateLimit,{max:120,timeWindow:'1 minute'});
 await registerPasswordResetRoutes(app,pool,{baseUrl:()=> 'https://app.example.test',send:async(to,url)=>{assert.equal(to,user.email);sends++;link=url;await deliveryGate;if(failMail)throw Error('smtp password=secret');}});
 const forgot=(email=user.email)=>app.inject({method:'POST',url:'/api/auth/forgot-password',payload:{email}});
 const reset=(value=new URL(link).hash.slice(7))=>app.inject({method:'POST',url:'/api/auth/reset-password',payload:{token:value,password:'new-password-123'}});
 return {app,user,forgot,reset,queries,token:()=>token,link:()=>link,sends:()=>sends,revoked:()=>revoked,tvRevoked:()=>tvRevoked};
}
test('SMTP reset stores only token hash, leaves old password until redemption, and uses trusted app URL',async()=>{
 const x=await fixture();try{const before=x.user.password_hash,r=await x.forgot();assert.equal(r.statusCode,200);assert.equal(x.sends(),1);const raw=new URL(x.link()).hash.slice(7);assert.match(raw,/^[\w-]{64}$/);assert.equal(x.token().token_hash,hash(raw));assert.equal(x.user.password_hash,before);assert.ok(!JSON.stringify(x.queries).includes(raw));assert.ok(!r.body.includes(raw));}finally{await x.app.close();}
});
test('valid link changes password once and revokes refresh tokens and TV grants',async()=>{
 const x=await fixture();try{await x.forgot();const r=await x.reset();assert.equal(r.statusCode,200,r.body);assert.ok(await argon2.verify(x.user.password_hash,'new-password-123'));assert.ok(x.revoked());assert.ok(x.tvRevoked());assert.ok(r.cookies.some(c=>c.name==='access_token'&&c.value===''));assert.equal((await x.reset()).statusCode,400);}finally{await x.app.close();}
});
test('expired, forged and superseded-password reset links cannot change a password',async()=>{
 const x=await fixture();try{await x.forgot();const before=x.user.password_hash;assert.equal((await x.reset('x'.repeat(64))).statusCode,400);x.token().expired=true;assert.equal((await x.reset()).statusCode,400);x.token().expired=false;x.user.password_hash=await argon2.hash('admin-changed-password');assert.equal((await x.reset()).statusCode,400);assert.notEqual(x.user.password_hash,before);}finally{await x.app.close();}
});
test('unknown account, invalid email and existing account receive identical public responses',async()=>{
 const x=await fixture();try{const a=await x.forgot('unknown@example.test'),b=await x.forgot('invalid'),c=await x.forgot();assert.equal(a.body,b.body);assert.equal(a.body,c.body);}finally{await x.app.close();}
});
test('account cooldown prevents repeat SMTP and route limits abusive requests',async()=>{
 const x=await fixture();try{for(let i=0;i<5;i++)assert.equal((await x.forgot()).statusCode,200);assert.equal(x.sends(),1);assert.equal((await x.forgot()).statusCode,429);}finally{await x.app.close();}
});
test('SMTP failure invalidates the link, records visible notification failure and leaks no credentials',async()=>{
 const x=await fixture(true);try{const r=await x.forgot();assert.equal(r.statusCode,200);assert.ok(x.token().used);assert.ok(x.queries.some(q=>q.sql.includes("'PASSWORD_RESET_EMAIL_FAILED'")));assert.ok(!r.body.includes('secret'));assert.equal((await x.reset()).statusCode,400);}finally{await x.app.close();}
});
test('reset origin is configured; preview links stay with preview database and unsafe URLs fail',()=>{
 assert.equal(passwordResetBaseUrl({VERCEL_ENV:'preview',VERCEL_URL:'preview.example.test',PUBLIC_APP_URL:'https://production.example.test'}),'https://preview.example.test');
 assert.equal(passwordResetBaseUrl({PUBLIC_APP_URL:'https://app.example.test/'}),'https://app.example.test');
 for(const env of [{},{PUBLIC_APP_URL:'http://unsafe.example.test'},{PUBLIC_APP_URL:'https://user:pass@app.example.test'},{PUBLIC_APP_URL:'https://app.example.test/?token=x'}])assert.throws(()=>passwordResetBaseUrl(env));
});
for(const [row,reason] of [[null,'not_generated'],[{status:'ready'},'ready'],[{status:'running',locked_until:new Date(Date.now()+120000)},'running'],[{status:'failed',error_code:'RETRY_FAILED:503'},'retry_used'],[{status:'failed',error_code:'GEMINI_UPSTREAM_503'},'available']] as const){
 test('executive retry preflight distinguishes '+reason,async()=>{let sql='';const result=await inspectExecutiveBriefRetry({query:async(q:string)=>{sql=q;return {rows:row?[row]:[]};}} as any,'2026-10-17');assert.equal(result.reason,reason);assert.equal(result.available,reason==='available');assert.ok(sql.startsWith('SELECT'));assert.ok(result.message.length>20);});
}
test('atomic retry claim remains restricted to one failed run for today',async()=>{let sql='';assert.equal(await claimExecutiveBriefRetry({query:async(q:string)=>{sql=q;return {rows:[]};}} as any,'2026-10-17'),false);assert.ok(sql.includes("status='failed'"));assert.ok(sql.includes("NOT LIKE 'RETRY_%'"));});
test('session restores valid root refresh even when stale legacy path cookie appears first',async()=>{
 const old='o'.repeat(64),valid='v'.repeat(64);const app=Fastify();await app.register(cookie);await registerAuthSessionRoutes(app,{query:async(sql:string,p:any[])=>({rows:p[0]===hash(valid)?[{session_id:'3',user_id:'1',email:'user@example.test',role:'viewer',active:true,created_at:new Date(),expires_at:new Date(Date.now()+900000)}]:[]})} as any,'test-secret');
 try{const r=await app.inject({url:'/api/auth/session',headers:{cookie:'refresh_token='+old+'; refresh_token='+valid}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().restored,true);assert.ok(r.cookies.some(c=>c.name==='access_token'));assert.ok(r.cookies.some(c=>c.name==='refresh_token'&&c.path==='/api/auth'&&c.value===''));assert.ok(r.cookies.some(c=>c.name==='refresh_token'&&c.path==='/'&&c.value===valid));}finally{await app.close();}
});
test('database outage is a retryable session check, never an invalid-session 401',async()=>{
 const app=Fastify();await app.register(cookie);await registerAuthSessionRoutes(app,{query:async()=>{throw Error('offline');}} as any,'test-secret');
 try{const r=await app.inject({url:'/api/auth/session',headers:{cookie:'refresh_token='+'v'.repeat(64)}});assert.equal(r.statusCode,503);assert.equal(r.json().error,'SESSION_CHECK_UNAVAILABLE');}finally{await app.close();}
});

test('SMTP sender reuses the active encrypted admin configuration and always closes transport',async()=>{
 const nodemailer=(await import('nodemailer')).default;
 const {sendPasswordResetEmail}=await import('./password-reset-routes.js');
 const {encryptIntegrationCredential}=await import('./integration-credentials.js');
 const oldKey=process.env.INTEGRATION_CREDENTIAL_KEY,oldTransport=nodemailer.createTransport;
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-key';let sent:any,closed=false,options:any;
 (nodemailer as any).createTransport=(value:any)=>{options=value;return{sendMail:async(message:any)=>{sent=message;return{accepted:['user@example.test'],rejected:[]};},close(){closed=true;}};};
 const pool={query:async()=>({rows:[{status:'ACTIVE',last_test_status:'SUCCESS',credential_ciphertext:encryptIntegrationCredential(JSON.stringify({password:'smtp-test-password'})),settings:{host:'smtp.example.test',port:465,secure:true,username:'sender',fromEmail:'sender@example.test'}}]})} as any;
 try{await sendPasswordResetEmail(pool,'user@example.test','https://app.example.test/reset-password.html#token=opaque');assert.equal(options.auth.pass,'smtp-test-password');assert.equal(options.secure,true);assert.equal(sent.to,'user@example.test');assert.ok(sent.text.includes('30 menit'));assert.ok(!sent.text.includes('smtp-test-password'));assert.ok(closed);}finally{nodemailer.createTransport=oldTransport;if(oldKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=oldKey;}
});
test('inactive SMTP is never used for password reset',async()=>{
 const {sendPasswordResetEmail}=await import('./password-reset-routes.js');
 await assert.rejects(()=>sendPasswordResetEmail({query:async()=>({rows:[{status:'INACTIVE'}]})} as any,'user@example.test','https://app.example.test'),/NOT_READY/);
});

 test('default forgot-password waits for SMTP and audit before finishing the response',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const x=await fixture(false,gate);let finished=false;
  try{
   const response=x.forgot().then(r=>{finished=true;return r;});
   for(let i=0;i<100&&x.sends()===0;i++)await new Promise(resolve=>setTimeout(resolve,5));
   assert.equal(x.sends(),1);assert.equal(finished,false);
   assert.ok(!x.queries.some(q=>q.sql.includes("'PASSWORD_RESET_EMAIL_SENT'")));
   release();assert.equal((await response).statusCode,200);
   assert.ok(x.queries.some(q=>q.sql.includes("'PASSWORD_RESET_EMAIL_SENT'")));
  }finally{release();await x.app.close();}
 });
 test('database connection failure keeps reset response generic',async()=>{
  const app=Fastify();await registerPasswordResetRoutes(app,{connect:async()=>{throw Error('database-secret');}} as any);
  try{const r=await app.inject({method:'POST',url:'/api/auth/forgot-password',payload:{email:'user@example.test'}});assert.equal(r.statusCode,200);assert.equal(r.json().ok,true);assert.ok(!r.body.includes('database-secret'));}finally{await app.close();}
 });
