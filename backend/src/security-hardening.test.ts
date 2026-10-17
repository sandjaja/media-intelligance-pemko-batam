import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {installSessionGuard,sessionAccessToken,SESSION_IDLE_MS,readRefreshSession} from './session-security.js';
import {registerAuthSessionRoutes} from './auth-session-routes.js';
import {registerPrintMediaRoutes} from './print-media-routes.js';
import {appendMediaReadScope} from './media-read-policy.js';
import {isPublicAddress,safePublicFetch} from './safe-public-fetch.js';
import {inspectExecutiveBriefRetry,readExecutiveBriefState,claimExecutiveBriefRetry} from './executive-brief-cache.js';
import {adapterClientIp} from './vercel.js';
import {trustedProxy} from './trusted-proxy.js';
const secret='hardening-test-only',refresh='r'.repeat(64);
const user=(role='opd')=>({id:'1',email:'user@example.test',role:role==='super_admin'?'admin':'operator',opd_id:role==='opd'?'10':null,district_id:role==='district'?'20':null,active:true,roles:[role],permissions:[]});
function grant(){return{session_id:'4',user_id:'1',email:'user@example.test',role:'operator',opd_id:'10',created_at:new Date(),expires_at:new Date(Date.now()+SESSION_IDLE_MS)};}
async function fixture(){
 let current=user(),session:any=grant(),revoked=false;
 const queries:{sql:string;p:any[]}[]=[];
 const pool={query:async(sql:string,p:any[]=[])=>{
  queries.push({sql,p});
  if(sql.includes('FROM refresh_tokens rt'))return{rows:revoked?[]:[session]};
  if(sql.includes('FROM users u'))return{rows:[current]};
  if(sql.startsWith('UPDATE refresh_tokens'))return{rows:[{id:'4'}]};
  return{rows:[]};
 }} as any;
 pool.connect=async()=>({query:pool.query,release(){}});
 const app=Fastify();await app.register(cookie);installSessionGuard(app,pool,secret);
 app.get('/api/protected',{preHandler:async(r,p)=>{try{jwt.verify(r.cookies.access_token||'',secret);}catch{return p.code(401).send({error:'UNAUTHENTICATED'});}}},r=>({role:r.sessionAuth?.legacyRole,opd:r.sessionAuth?.opdId}));
 await registerAuthSessionRoutes(app,pool,secret);await registerPrintMediaRoutes(app,pool,secret);
 const headers=()=>({cookie:'access_token='+sessionAccessToken(grant(),refresh,secret)+'; refresh_token='+refresh});
 return{app,queries,headers,pool,setUser:(u:any)=>current=u,revoke:()=>revoked=true,setSession:(s:any)=>session=s};
}
test('revoked refresh grant immediately rejects a still-valid copied access JWT, including session restoration',async()=>{
 const x=await fixture();try{assert.equal((await x.app.inject({url:'/api/protected',headers:x.headers()})).statusCode,200);x.revoke();assert.equal((await x.app.inject({url:'/api/protected',headers:x.headers()})).statusCode,401);assert.equal((await x.app.inject({url:'/api/auth/session',headers:x.headers()})).statusCode,401);}finally{await x.app.close();}
});
test('inactive account, JWT without grant, mismatched grant and pre-hardening grants fail closed',async()=>{
 const x=await fixture();try{
  const access=sessionAccessToken(grant(),refresh,secret);
  assert.equal((await x.app.inject({url:'/api/protected',headers:{cookie:'access_token='+access}})).statusCode,401);
  x.setUser({...user(),active:false});assert.equal((await x.app.inject({url:'/api/protected',headers:x.headers()})).statusCode,401);
  x.setUser(user());x.setSession({...grant(),user_id:'2'});assert.equal((await x.app.inject({url:'/api/protected',headers:x.headers()})).statusCode,401);
  x.setSession({...grant(),expires_at:new Date(Date.now()+86400000)});assert.equal((await x.app.inject({url:'/api/auth/session',headers:x.headers()})).statusCode,401);
 }finally{await x.app.close();}
});
test('legacy route JWT claims are refreshed from current database privileges',async()=>{
 const x=await fixture();try{x.setUser({...user('viewer'),role:'viewer'});const r=await x.app.inject({url:'/api/protected',headers:x.headers()});assert.equal(r.statusCode,200);assert.equal(r.json().role,'viewer');assert.equal(r.json().opd,null);}finally{await x.app.close();}
});
test('expired idle grant cannot be restored even with an unexpired access JWT',async()=>{
 const x=await fixture();try{x.setSession({...grant(),expires_at:new Date(Date.now()-1000)});assert.equal(await readRefreshSession(x.pool,refresh),null);assert.equal((await x.app.inject({url:'/api/auth/session',headers:x.headers()})).statusCode,401);}finally{await x.app.close();}
});
for(const role of ['opd','district'])test(`actual print list, detail and evidence SQL enforce ${role} scope plus analyzed status`,async()=>{
 const x=await fixture();try{x.setUser(user(role));for(const url of ['/api/print/articles','/api/print/articles/8','/api/print/evidence/9'])await x.app.inject({url,headers:x.headers()});
  const queries=x.queries.filter(q=>q.sql.includes('FROM print_articles pa')||q.sql.includes('FROM print_upload_files puf'));
  assert.equal(queries.length,3);for(const q of queries){assert.match(q.sql,role==='opd'?/pa.opd_id=\$/ : /pa.district_id=\$/);assert.match(q.sql,/pa.status='analyzed'/);assert.ok(q.p.includes(role==='opd'?'10':'20'));}
 }finally{await x.app.close();}
});
test('missing OPD/district binding yields no scope, never unrestricted SQL',()=>{
 for(const role of ['opd','district']){const w:string[]=[],p:any[]=[];appendMediaReadScope({...user(role),legacyRole:'operator',opdId:null,districtId:null} as any,p,w,'online');assert.deepEqual(w,['FALSE']);}
});
for(const ip of ['127.0.0.2','10.1.2.3','169.254.169.254','100.64.1.1','0.0.0.0','192.168.1.3','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::'])test('URL fetch rejects non-public address '+ip,()=>assert.equal(isPublicAddress(ip),false));
function transport(responses:Array<{status:number;headers?:any;chunks?:string[]}>,seen:any[]){
 return ((url:any,options:any,cb:any)=>{
  seen.push({url:String(url),options});const req=new EventEmitter() as any;
  req.end=()=>{options.lookup(url.hostname,{},(_e:any,ip:string)=>seen[seen.length-1].pinned=ip);const next=responses.shift()!;const res=Readable.from(next.chunks||[]) as any;res.statusCode=next.status;res.headers=next.headers||{};cb(res);};return req;
 }) as any;
}
test('fetch pins checked DNS address and revalidates every redirect before transport',async()=>{
 const seen:any[]=[];await assert.rejects(()=>safePublicFetch('https://example.test/',{resolve:async()=>[{address:'8.8.8.8',family:4}] as any,request:transport([{status:302,headers:{location:'http://127.0.0.2/private'}}],seen)}),/HOST_NOT_ALLOWED/);assert.equal(seen.length,1);assert.equal(seen[0].pinned,'8.8.8.8');
});
test('mixed public/private DNS and URL credentials never reach transport',async()=>{
 const seen:any[]=[];for(const url of ['https://user:pass@example.test/','https://example.test/'])await assert.rejects(()=>safePublicFetch(url,{resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}] as any,request:transport([],seen)}));assert.equal(seen.length,0);
});
test('chunked response exceeding byte cap is aborted without trusting Content-Length',async()=>{
 await assert.rejects(()=>safePublicFetch('https://8.8.8.8/',{maxBytes:4,request:transport([{status:200,chunks:['123','456']}],[])}),/SOURCE_TOO_LARGE/);
});
test('public response under cap is accepted',async()=>{
 const r=await safePublicFetch('https://8.8.8.8/',{request:transport([{status:200,chunks:['ok']}],[])});assert.equal(r.text,'ok');assert.equal(r.ok,true);
});
test('expired brief lock permits one explicit retry and reports failed while keeping stored brief',async()=>{
 let sql='';const db={query:async(q:string)=>{sql=q;return{rows:q.includes("status='ready'")?[{brief_date:'2026-10-16',brief_json:{headline:'Cached'}}]:[{status:'running',locked_until:new Date(Date.now()-5000),error_code:null}]};}} as any;
 assert.equal((await inspectExecutiveBriefRetry(db,'2026-10-17')).available,true);assert.equal((await readExecutiveBriefState(db,'2026-10-17')).status,'failed');await claimExecutiveBriefRetry(db,'2026-10-17');assert.match(sql,/locked_until<=now\(\)/);assert.match(sql,/NOT LIKE 'RETRY_%'/);
});
test('only Vercel adapter loopback hop can supply one validated forwarded client IP',()=>{
 const old=process.env.VERCEL;try{process.env.VERCEL='1';assert.ok(trustedProxy('127.0.0.1',0));assert.equal(trustedProxy('8.8.8.8',0),false);assert.equal(trustedProxy('127.0.0.1',1),false);const req={headers:{'x-forwarded-for':'8.8.8.8'},socket:{remoteAddress:'1.1.1.1'}} as any;assert.equal(adapterClientIp(req),'8.8.8.8');req.headers['x-forwarded-for']='8.8.8.8, 9.9.9.9';assert.equal(adapterClientIp(req),'1.1.1.1');delete process.env.VERCEL;assert.equal(trustedProxy('127.0.0.1',0),false);assert.equal(adapterClientIp(req),'1.1.1.1');}finally{if(old===undefined)delete process.env.VERCEL;else process.env.VERCEL=old;}
});

test('authentication attempts are shared across instances and account/IP limits do not contain raw credentials',async()=>{
 const {claimAuthAttempt}=await import('./auth-attempt-limit.js');const events:any[]=[];
 const query=async(sql:string,p:any[]=[])=>{
  if(sql.startsWith('SELECT COUNT'))return{rows:[{ip_count:events.filter(e=>e.ipKey===p[0]).length,account_count:events.filter(e=>p[1]&&e.accountKey===p[1]).length}]};
  if(sql.startsWith('INSERT INTO audit_logs'))events.push(JSON.parse(p[0]));return{rows:[]};
 };
 const db={connect:async()=>({query,release(){}})} as any;
 for(let i=0;i<10;i++)assert.equal(await claimAuthAttempt(db,{path:'/api/auth/login',ip:'8.8.8.'+i,email:'user@example.test',secret}),true);
 assert.equal(await claimAuthAttempt(db,{path:'/api/auth/login',ip:'9.9.9.9',email:'user@example.test',secret}),false);
 assert.equal(await claimAuthAttempt(db,{path:'/api/auth/login',ip:'9.9.9.9',email:'other@example.test',secret}),true);
 assert.ok(!JSON.stringify(events).includes('user@example.test'));assert.ok(!JSON.stringify(events).includes('8.8.8.'));
});
test('password reset returns uniform response before registered or unknown account lookup completes',async()=>{
 const {registerPasswordResetRoutes}=await import('./password-reset-routes.js');
 const {createBackgroundScope}=await import('./background-tasks.js');
 let release!:()=>void;const blocked=new Promise<void>(r=>release=r);let queried=false;
 const pool={connect:async()=>{await blocked;return{query:async()=>{queried=true;return{rows:[]};},release(){}};}} as any;
 const app=Fastify();await app.register(cookie);await registerPasswordResetRoutes(app,pool);const scope=createBackgroundScope();
 try{const r=await app.inject({method:'POST',url:'/api/auth/forgot-password',headers:{'x-mi-background-scope':scope.id},payload:{email:'someone@example.test'}});assert.equal(r.statusCode,200);assert.equal(queried,false);assert.match(r.json().message,/hubungi Administrator/);release();await scope.finish();assert.equal(queried,true);}finally{release();await app.close();}
});

// Execute the actual legacy server handlers, not a duplicated policy helper.
async function legacyRoutes(x:Awaited<ReturnType<typeof fixture>>){
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');const {transformSync}=await import('esbuild');const {z}=await import('zod');const {loadAuthorizationContext}=await import('./rbac.js');const {isGlobalOperator}=await import('./media-read-policy.js');
 const source=readFileSync(new URL('./server.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function requireAuth('),end=source.indexOf("app.addHook('onSend'",start);
 const routes=['/api/articles','/api/highlights','/api/alerts','/api/executive-brief/cached'];
 const lines=source.split('\n');const selected=lines.filter(l=>routes.some(r=>l.startsWith("app.get('"+r+"'"))||l.startsWith("app.patch('/api/alerts/:id'"));
 // The cached brief handler spans multiple lines; only its guard is required here.
 const brief=selected.findIndex(l=>l.startsWith("app.get('/api/executive-brief/cached'"));if(brief>=0)selected[brief]="app.get('/api/executive-brief/cached',{preHandler:[requireAuth,requireGlobalRead]},async()=>({}));";
 const filter=lines.find(l=>l.startsWith('const filterOpd='));
 const code=transformSync(source.slice(start,end)+'\n'+filter+'\n'+selected.join('\n'),{loader:'ts',format:'cjs',target:'es2022'}).code;
 vm.runInNewContext(code,{app:x.app,pool:x.pool,z,loadAuthorizationContext,appendMediaReadScope,isGlobalOperator});
}
for(const role of ['opd','district'])test(`actual legacy handlers enforce ${role} media scope and reject alert writes/global brief`,async()=>{
 const x=await fixture();try{x.setUser(user(role));await legacyRoutes(x);
  for(const url of ['/api/articles','/api/highlights','/api/alerts'])assert.equal((await x.app.inject({url,headers:x.headers()})).statusCode,200);
  const reads=x.queries.filter(q=>q.sql.includes('FROM articles a')||q.sql.includes('FROM article_alerts aa'));
  assert.equal(reads.length,3);for(const q of reads){assert.match(q.sql,role==='opd'?/a.opd_id=\$/:/a.district_id=\$/);assert.match(q.sql,/ARTICLE_CLASSIFICATION_VERIFIED/);assert.ok(q.p.includes(role==='opd'?'10':'20'));}
  assert.equal((await x.app.inject({method:'PATCH',url:'/api/alerts/8',headers:x.headers(),payload:{status:'resolved'}})).statusCode,403);
  assert.ok(!x.queries.some(q=>q.sql.startsWith('UPDATE article_alerts')));
  assert.equal((await x.app.inject({url:'/api/executive-brief/cached',headers:x.headers()})).statusCode,403);
 }finally{await x.app.close();}
});
test('incident child updates join the exact parent and fail-closed null scopes are in actual server handlers',async()=>{
 const {readFileSync}=await import('node:fs');const s=readFileSync(new URL('./server.ts',import.meta.url),'utf8');
 assert.match(s,/t.incident_id=\$3 AND i.id=t.incident_id/);assert.match(s,/d.incident_id=\$3 AND i.id=d.incident_id/);
 assert.ok(!s.includes("role==='admin'?null:request.user?.opdId"));
});

test('startup failure does not poison the instance and concurrent retries share one attempt after backoff',async()=>{
 const {createBackendStartup}=await import('./backend-startup.js');let calls=0,time=1000;
 const ensure=createBackendStartup(async()=>{calls++;if(calls===1)throw Error('TRANSIENT_BOOTSTRAP');},5000,()=>time);
 await assert.rejects(ensure,/TRANSIENT_BOOTSTRAP/);await assert.rejects(ensure,/RETRY_LATER/);assert.equal(calls,1);time+=5001;await Promise.all([ensure(),ensure(),ensure()]);assert.equal(calls,2);
});
test('alternate print evidence recovery route also enforces article/file association, district and final state',async()=>{
 const {registerPrintEvidenceRecoveryRoutes}=await import('./print-evidence-recovery-routes.js');const x=await fixture();try{x.setUser(user('district'));await registerPrintEvidenceRecoveryRoutes(x.app,x.pool,secret);const r=await x.app.inject({url:'/api/print/evidence-v2/9',headers:x.headers()});assert.equal(r.statusCode,404);const q=x.queries.find(q=>q.sql.includes('FROM print_upload_files puf'))!;assert.match(q.sql,/pa.district_id=\$/);assert.match(q.sql,/pa.status='analyzed'/);assert.match(q.sql,/es.print_article_id=pa.id/);assert.match(q.sql,/f->>'id'=puf.id::text/);assert.ok(!x.queries.some(q=>q.sql.startsWith('CREATE TABLE')));}finally{await x.app.close();}
});
test('print warning detail and list cannot bypass the district/final scope policy',async()=>{
 const {registerPrintWarningSignalRoutes}=await import('./print-warning-signal.js');const x=await fixture();try{x.setUser(user('district'));await registerPrintWarningSignalRoutes(x.app,x.pool,secret);
 assert.equal((await x.app.inject({url:'/api/print/articles/8/warning-signal',headers:x.headers()})).statusCode,404);
 assert.equal((await x.app.inject({url:'/api/intelligence/warning-signals',headers:x.headers()})).statusCode,200);
 const queries=x.queries.filter(q=>q.sql.includes('FROM print_articles pa'));assert.equal(queries.length,2);for(const q of queries){assert.match(q.sql,/pa.district_id=\$/);assert.match(q.sql,/pa.status='analyzed'/);}
 }finally{await x.app.close();}
});
test('real Fastify limiter isolates forwarded clients and ignores spoofed headers from untrusted peers',async()=>{
 const rateLimit=(await import('@fastify/rate-limit')).default;const previous=process.env.VERCEL;process.env.VERCEL='1';const app=Fastify({trustProxy:trustedProxy});
 try{await app.register(rateLimit,{max:2,timeWindow:'1 minute'});app.get('/ip',r=>({ip:r.ip}));
 for(let i=0;i<2;i++)assert.equal((await app.inject({url:'/ip',headers:{'x-forwarded-for':'8.8.8.8'}})).statusCode,200);
 assert.equal((await app.inject({url:'/ip',headers:{'x-forwarded-for':'8.8.8.8'}})).statusCode,429);
 const other=await app.inject({url:'/ip',headers:{'x-forwarded-for':'9.9.9.9'}});assert.equal(other.statusCode,200);assert.equal(other.json().ip,'9.9.9.9');
 const spoofed=await app.inject({url:'/ip',remoteAddress:'1.1.1.1',headers:{'x-forwarded-for':'9.9.9.9'}});assert.equal(spoofed.json().ip,'1.1.1.1');
 }finally{await app.close();if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
