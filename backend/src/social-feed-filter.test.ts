import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import {registerSocialIntelligenceRoutes} from './social-intelligence-routes.js';
import {socialFeedPredicate} from './social-feed-filter.js';

async function fixture(role='humas'){
 const queries:{sql:string;params:any[]}[]=[];
 const pool={query:async(sql:string,params:any[]=[])=>{
  queries.push({sql,params});
  if(sql.includes('FROM users u'))return{rows:[{id:'1',email:'test@example.test',role:role==='humas'?'operator':'viewer',active:true,roles:[role],permissions:[],opd_id:role==='opd'?'7':null,district_id:null}]};
  if(sql.includes('FROM organizations WHERE active=true'))return{rows:[{id:1}],rowCount:1};
  if(sql.includes('SELECT COUNT(*)::int total FROM social_mentions'))return{rows:[{total:23}]};
  return{rows:[]};
 }} as any;
 const app=Fastify();await app.register(cookie);await registerSocialIntelligenceRoutes(app,pool,'test');
 return{app,queries,headers:{cookie:'access_token='+jwt.sign({sub:'1'},'test')}};
}
for(const feed of ['main','comments','hashtag','all'] as const)test(`${feed} filters feed pagination, summary, trends and cluster membership consistently`,async()=>{
 const x=await fixture();try{
  for(const path of ['mentions','summary','conversation-insights','conversation-clusters']){
   x.queries.length=0;const r=await x.app.inject({url:`/api/social/${path}?days=7&feedType=${feed}&page=2`,headers:x.headers});assert.equal(r.statusCode,200,r.body);
   const sql=x.queries.filter(q=>/FROM social_mentions|JOIN social_mentions/.test(q.sql));assert.ok(sql.length>0);
   for(const q of sql){const alias=q.sql.includes('FROM social_mentions sm')||q.sql.includes('JOIN social_mentions sm')?'sm':'';assert.ok(q.sql.includes(socialFeedPredicate(feed,alias)),q.sql);}
   if(path==='mentions'){assert.equal(r.json().pagination.total,23);assert.equal(r.json().pagination.page,2);assert.ok(sql.at(-1)!.params.includes(10));}
  }
 }finally{await x.app.close();}
});
test('comment feed retains OPD locked evidence and scope restrictions; malformed filters are rejected',async()=>{
 const x=await fixture('opd');try{
  const r=await x.app.inject({url:'/api/social/mentions?feedType=comments&opdId=99',headers:x.headers});assert.equal(r.statusCode,200,r.body);
  const q=x.queries.find(q=>q.sql.includes('SELECT COUNT(*)::int total FROM social_mentions'))!;assert.match(q.sql,/socialVerification/);assert.match(q.sql,/primaryOpdId/);assert.ok(q.params.includes('7'));assert.ok(!q.params.includes('99'));
  assert.equal((await x.app.inject({url:'/api/social/mentions?feedType=invalid',headers:x.headers})).statusCode,400);
 }finally{await x.app.close();}
});
