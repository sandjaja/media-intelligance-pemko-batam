import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import {createHash} from 'node:crypto';
import {registerViewerDisplayRoutes,TV_COOKIE,isDisplayViewer} from './viewer-display-routes.js';
import {createDisplayDataReader,displayDate,displayNewsSql,displayIssuesSql,readDisplayMap} from './viewer-display-data.js';

async function fixture(){
 const users:any={viewer:{id:'1',email:'viewer@example.test',role:'viewer',active:true,roles:['viewer'],permissions:[],opd_id:null,district_id:null},admin:{id:'2',role:'admin',active:true,roles:['super_admin'],permissions:[]}};
 let grant:any=null,reads=0;const queries:{sql:string;params:any[]}[]=[];
 const query=async(sql:string,params:any[]=[])=>{
  queries.push({sql,params});
  if(sql.includes('FROM users u'))return{rows:params[0]==='1'?[users.viewer]:params[0]==='2'?[users.admin]:[]};
  if(sql.includes('SELECT id FROM organizations'))return{rows:[{id:'7'}]};
  if(sql.startsWith('INSERT INTO viewer_display_devices')){grant={id:'10',user_id:params[0],organization_id:params[1],name:params[2],token_hash:params[3],expires_at:params[4],revoked_at:null};return{rows:[{id:'10',name:params[2],expires_at:params[4]}]};}
  if(sql.includes('FROM viewer_display_devices d JOIN organizations'))return{rows:grant&&grant.token_hash===params[0]&&!grant.revoked_at&&Date.parse(grant.expires_at)>Date.now()?[grant]:[]};
  if(sql.includes('FROM viewer_display_devices d JOIN users'))return{rows:grant?[{id:grant.id,name:grant.name,email:users.viewer.email,expires_at:grant.expires_at}]:[]};
  if(sql.startsWith('UPDATE viewer_display_devices SET revoked_at')){if(grant&&(params[0]===grant.id||params[0]===grant.token_hash)&&(!sql.includes('organization_id=$2')||params[1]===grant.organization_id)){grant.revoked_at=new Date();return{rows:[{id:grant.id}]};}return{rows:[]};}
  return{rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})} as any;
 const app=Fastify();await app.register(cookie);await registerViewerDisplayRoutes(app,pool,'secret',async org=>{reads++;return{organization:org,news:{total:40,items:[]}};});
 const jwtCookie=(id='1')=>'access_token='+jwt.sign({sub:id},'secret');
 async function register(){const r=await app.inject({method:'POST',url:'/api/tv/devices',headers:{cookie:jwtCookie()},payload:{name:'TV Pimpinan'}});assert.equal(r.statusCode,201,r.body);const token=r.cookies.find(c=>c.name===TV_COOKIE)!.value;return{response:r,token,cookie:TV_COOKIE+'='+token};}
 return{app,pool,users,queries,register,jwtCookie,grant:()=>grant,reads:()=>reads};
}
test('device grant is created only after viewer login; secret stays in a restricted HttpOnly cookie',async()=>{
 const x=await fixture();try{
  assert.equal((await x.app.inject({method:'POST',url:'/api/tv/devices',payload:{name:'TV'}})).statusCode,401);
  assert.equal((await x.app.inject({method:'POST',url:'/api/tv/devices',headers:{cookie:x.jwtCookie('2')},payload:{name:'TV'}})).statusCode,403);
  const {response,token}=await x.register(),cookie=response.cookies.find(c=>c.name===TV_COOKIE)!;
  assert.equal(cookie.httpOnly,true);assert.equal(cookie.path,'/api/tv');assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.maxAge,2592000);assert.ok(!response.body.includes(token));assert.equal(x.grant().token_hash,createHash('sha256').update(token).digest('hex'));
  const audit=x.queries.filter(q=>q.sql.includes('audit_logs'));assert.ok(audit.every(q=>!JSON.stringify(q.params).includes(token)));
 }finally{await x.app.close();}
});
test('normal JWT alone cannot read TV; device cookie continues without normal login cookies',async()=>{
 const x=await fixture();try{
  assert.equal((await x.app.inject({url:'/api/tv/data',headers:{cookie:x.jwtCookie()}})).statusCode,401);
  const d=await x.register();const r=await x.app.inject({url:'/api/tv/data',headers:{cookie:d.cookie}});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.organization,'7');assert.equal(r.headers['cache-control'],'no-store');assert.equal(x.reads(),1);
  // Opaque device credentials never become a regular login JWT.
  assert.throws(()=>jwt.verify(d.token,'secret'));
 }finally{await x.app.close();}
});
test('admin revocation takes effect before cached data is returned and viewer cannot administer devices',async()=>{
 const x=await fixture();try{
  const d=await x.register();await x.app.inject({url:'/api/tv/data',headers:{cookie:d.cookie}});
  assert.equal((await x.app.inject({url:'/api/admin/tv-devices',headers:{cookie:d.cookie}})).statusCode,403);
  assert.equal((await x.app.inject({method:'POST',url:'/api/admin/tv-devices/10/revoke',headers:{cookie:x.jwtCookie()}})).statusCode,403);
  const list=await x.app.inject({url:'/api/admin/tv-devices',headers:{cookie:x.jwtCookie('2')}});assert.equal(list.statusCode,200);assert.ok(!list.body.includes(d.token));assert.ok(!list.body.includes(x.grant().token_hash));
  assert.equal((await x.app.inject({method:'POST',url:'/api/admin/tv-devices/10/revoke',headers:{cookie:x.jwtCookie('2')}})).statusCode,200);
  assert.equal((await x.app.inject({url:'/api/tv/data',headers:{cookie:d.cookie}})).statusCode,401);assert.equal(x.reads(),1);
 }finally{await x.app.close();}
});
for(const invalid of ['expired','inactive','role_changed','scoped'] as const)test(`${invalid} device grant stops being usable`,async()=>{
 const x=await fixture();try{
  const d=await x.register();if(invalid==='expired')x.grant().expires_at=new Date(0);if(invalid==='inactive')x.users.viewer.active=false;if(invalid==='role_changed')x.users.viewer.roles=['humas'];if(invalid==='scoped')x.users.viewer.opd_id=7;
  assert.equal((await x.app.inject({url:'/api/tv/session',headers:{cookie:d.cookie}})).statusCode,401);assert.equal(x.reads(),0);
  if(invalid!=='expired')assert.ok(x.grant().revoked_at);
 }finally{await x.app.close();}
});
test('cross-origin activation/revocation rejected and leaving TV revokes its grant',async()=>{
 const x=await fixture();try{
  const bad=await x.app.inject({method:'POST',url:'/api/tv/devices',headers:{cookie:x.jwtCookie(),origin:'https://evil.test'},payload:{name:'TV'}});assert.equal(bad.statusCode,403);assert.equal(x.grant(),null);
  const d=await x.register();assert.equal((await x.app.inject({method:'DELETE',url:'/api/tv/device',headers:{cookie:d.cookie,origin:'https://evil.test'}})).statusCode,403);
  const r=await x.app.inject({method:'DELETE',url:'/api/tv/device',headers:{cookie:d.cookie}});assert.equal(r.statusCode,200);assert.ok(x.grant().revoked_at);assert.equal((await x.app.inject({url:'/api/tv/session',headers:{cookie:d.cookie}})).statusCode,401);
 }finally{await x.app.close();}
});
test('viewer display cannot be issued to a scoped or mixed role account',()=>{
 const base:any={active:true,legacyRole:'viewer',roles:['viewer'],opdId:null,districtId:null};assert.equal(isDisplayViewer(base),true);
 for(const change of [{roles:['viewer','humas']},{opdId:'3'},{districtId:'3'},{active:false},{legacyRole:'admin'}])assert.equal(isDisplayViewer({...base,...change}),false);
});
test('display date uses WIB midnight and cached snapshot remains read-only across refreshes',async()=>{
 assert.equal(displayDate(new Date('2026-10-16T17:00:00Z')),'2026-10-17');let calls=0,current=new Date('2026-10-17T01:00:00Z');
 const pool={query:async(sql:string,params:any[])=>{calls++;if(params){assert.equal(params[0],'7');assert.equal(params[1],'2026-10-17');}assert.match(sql,/^WITH|^SELECT/);return{rows:[{total:100,items:[{title:'Tersimpan'}]}]};}} as any;
 const reader=createDisplayDataReader(pool,async()=>({regions:[]}) as any,()=>current);
 const [a,b]=await Promise.all([reader('7'),reader('7')]);assert.equal(a,b);assert.equal(calls,3);assert.equal(a.news.total,100);await reader('7');assert.equal(calls,3);current=new Date('2026-10-17T01:05:01Z');await reader('7');assert.equal(calls,6);
 assert.match(displayNewsSql,/CLASSIFICATION_VERIFIED/);assert.match(displayNewsSql,/riskStatus.*FINAL/);assert.match(displayNewsSql,/organization_id=\$1/);assert.match(displayIssuesSql,/created_at AT TIME ZONE 'Asia\/Jakarta'/);assert.match(displayIssuesSql,/updated_at AT TIME ZONE 'Asia\/Jakarta'/);
 assert.ok(!/UPDATE|INSERT|DELETE/.test(displayNewsSql+displayIssuesSql));
});
test('map uses only active boundary mappings and unavailable geometry still returns region data',async()=>{
 const queries:string[]=[];const pool={query:async(sql:string,params:any[])=>{queries.push(sql);assert.ok(sql.startsWith('SELECT'));
  if(sql.includes('FROM districts d'))return{rows:[{id:'3',name:'Batam Kota',total:2}]};if(sql.includes('FROM organization_map_boundaries'))return{rows:[{id:'9',optimized_storage_key:'private-map'}]};if(sql.includes('FROM organization_map_boundary_features'))return{rows:[{feature_key:'A',district_id:3}]};return{rows:[]};}} as any;
 const mapped=await readDisplayMap(pool,'7',async()=>({features:[{properties:{featureKey:'A',secret:'private'},geometry:{type:'Polygon',coordinates:[]}},{properties:{featureKey:'other'}}]}));assert.equal(mapped.geojson.features.length,1);assert.deepEqual(mapped.geojson.features[0].properties,{districtId:'3'});
 const unavailable=await readDisplayMap(pool,'7',async()=>{throw Error('offline');});assert.equal(unavailable.mapUnavailable,true);assert.equal(unavailable.regions[0].total,2);assert.ok(queries.some(q=>q.includes('i.organization_id=$1')));
});
