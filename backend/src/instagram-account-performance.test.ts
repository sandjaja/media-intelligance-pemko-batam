import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { parseInstagramProfileHtml, probeInstagramPublicProfile } from './instagram-public-profile.js';
import { registerInstagramPerformanceRoutes } from './instagram-account-performance.js';
import type { AuthorizationContext } from './rbac.js';
const admin:AuthorizationContext={id:'1',email:'test@example.com',legacyRole:'operator',active:true,roles:['humas'],permissions:[],opdId:null,districtId:null};
const html=`<meta content="5,413 Followers, 89 Following, 3,128 Posts - (&#064;diskominfobatam)" property="og:description"><script type="application/json">{"data":{"unrelated":{"username":"other","follower_count":999999},"xig_user_by_username":{"username":"diskominfobatam","follower_count":5414,"following_count":88}}}</script>`;
test('parser binds metrics to requested username and records provenance',()=>{
 const r=parseInstagramProfileHtml(html,'diskominfobatam');
 assert.deepEqual(r.publicMetrics,{followers:5414,following:88,posts:3128,source:'structured_profile'});
 assert.deepEqual(r.metricSources,{followers:'structured_profile',following:'structured_profile',posts:'meta_description'});
 const other=parseInstagramProfileHtml(html,'not-the-account');assert.equal(other.publicMetrics.followers,null);assert.equal(other.publicMetrics.posts,null);
});
test('login redirects never become successful measurements',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{const r=new Response(html,{status:200});Object.defineProperty(r,'url',{value:'https://www.instagram.com/accounts/login/'});return r;};
 try{const r=await probeInstagramPublicProfile('diskominfobatam');assert.equal(r.status,'login_wall');assert.equal(r.publicMetrics.followers,null);}finally{globalThis.fetch=original;}
});
async function setup(ctx=admin,available=true){
 const app=Fastify();let inserts=0;const history:any[]=[];
 const account={id:'3',platform:'instagram',handle:'@diskominfobatam',account_name:'Diskominfo',opd_id:'2',district_id:null};
 const pool={async query(sql:string,params:any[]){
  if(sql.includes('FROM owned_social_accounts'))return{rows:[account]};
  if(sql.includes('SELECT measured_at'))return{rows:history};
  if(sql.includes('INSERT INTO owned_social_account_metrics')){inserts++;history.push({measured_at:new Date().toISOString(),followers:params[1],following:params[2],total_posts:params[3],raw_payload:JSON.parse(params[4])});return{rows:[]};}
  throw new Error('Unexpected query');
 }} as unknown as Pool;
 const auth=async(request:any)=>{request.ownedClusterAuth=ctx;};
 const write=async(_request:any,reply:any)=>{if(!ctx.roles.includes('humas'))return reply.code(403).send({error:'FORBIDDEN'});};
 const parsed=parseInstagramProfileHtml(html,'diskominfobatam');
 const probe=async()=>({status:available?'public_metrics_available':'blocked',...parsed,httpStatus:available?200:429}) as any;
 registerInstagramPerformanceRoutes(app,pool,{read:[auth],write:[auth,write]},probe);await app.ready();return{app,inserts:()=>inserts};
}
test('collection saves metrics, reuses fresh reading, and exposes history',async()=>{
 const {app,inserts}=await setup();try{
  const first=await app.inject({method:'POST',url:'/api/social/instagram/account-performance/collect',payload:{accountId:3}});
  assert.equal(first.statusCode,200);assert.equal(first.json().data.latest.followers,5414);assert.equal(inserts(),1);
  const second=await app.inject({method:'POST',url:'/api/social/instagram/account-performance/collect',payload:{accountId:3}});
  assert.equal(second.json().data.cached,true);assert.equal(inserts(),1);
  assert.equal((await app.inject('/api/social/instagram/account-performance/3')).json().data.history.length,1);
 }finally{await app.close();}
});
test('blocked collection never saves an empty snapshot',async()=>{
 const {app,inserts}=await setup(admin,false);try{const r=await app.inject({method:'POST',url:'/api/social/instagram/account-performance/collect',payload:{accountId:3}});assert.equal(r.statusCode,422);assert.equal(inserts(),0);}finally{await app.close();}
});
test('OPD cannot read other units and Executive cannot collect',async()=>{
 const scoped=await setup({...admin,roles:['opd'],opdId:'99'});try{assert.equal((await scoped.app.inject('/api/social/instagram/account-performance/3')).statusCode,403);}finally{await scoped.app.close();}
 const exec=await setup({...admin,roles:['executive']});try{assert.equal((await exec.app.inject('/api/social/instagram/account-performance/3')).statusCode,200);assert.equal((await exec.app.inject({method:'POST',url:'/api/social/instagram/account-performance/collect',payload:{accountId:3}})).statusCode,403);}finally{await exec.app.close();}
});
