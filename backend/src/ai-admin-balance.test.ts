import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { registerAiAdminRoutes } from './ai-admin-routes.js';

const secret='test-only-admin-secret';
const headers={cookie:'access_token='+jwt.sign({sub:'99'},secret)};
async function fixture(options:{role?:string;failActivation?:boolean;ambiguous?:boolean}={}){
 const statements:Array<{sql:string;params:any[]}>=[];
 let connections=0;
 const query=async(sql:string,params:any[]=[])=>{
  statements.push({sql,params});
  const rows=(data:any[])=>({rows:data,rowCount:data.length});
  if(sql.includes('FROM users u'))return rows([{id:99,email:'admin@example.invalid',role:'operator',active:true,roles:[options.role||'super_admin'],permissions:[]}]);
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return rows([]);
  if(sql.includes('SELECT id FROM ai_providers WHERE'))return rows([{id:2}]);
  if(sql.includes('SUM(CASE'))return rows([{usd:'1.25'}]);
  if(sql.includes('SELECT id FROM ai_provider_budgets'))return rows(options.ambiguous?[{id:1},{id:2}]:[{id:1}]);
  if(sql.includes('INSERT INTO ai_provider_balance_snapshots'))return rows([{id:3}]);
  if(sql.includes('UPDATE ai_providers SET enabled=')){
   if(options.failActivation)throw Error('MOCK_UPDATE_FAILED');
   return rows([{id:2}]);
  }
  if(sql.includes('INSERT INTO audit_logs'))return rows([{id:4}]);
  throw Error('UNEXPECTED_DB: '+sql);
 };
 const pool={query,connect:async()=>{connections++;return{query,release(){}};}} as unknown as Pool;
 const app=Fastify();await app.register(cookie);await registerAiAdminRoutes(app,pool,secret);await app.ready();
 return {app,statements,connections:()=>connections};
}
for(const providerCode of ['openai','anthropic'])for(const balanceUsd of [0,0.0001,10])test(`saving ${providerCode} balance ${balanceUsd} atomically sets provider activation`,async()=>{
 const x=await fixture();
 try{
  const result=await x.app.inject({method:'POST',url:'/api/admin/ai/manual-balances',headers,payload:{providerCode,balanceUsd,reason:'Saldo provider diperbarui'}});
  assert.equal(result.statusCode,200,result.body);assert.equal(result.json().provider_enabled,balanceUsd>0);
  assert.deepEqual(x.statements.find(q=>q.sql.includes('UPDATE ai_providers SET enabled='))?.params,[2,balanceUsd>0]);
  const snapshot=x.statements.findIndex(q=>q.sql.includes('INSERT INTO ai_provider_balance_snapshots'));
  const activation=x.statements.findIndex(q=>q.sql.includes('UPDATE ai_providers SET enabled='));
  const commit=x.statements.findIndex(q=>q.sql==='COMMIT');assert.ok(snapshot<activation&&activation<commit);
  assert.deepEqual(x.statements[snapshot].params,[2,balanceUsd,'1.25','Saldo provider diperbarui','99']);
  assert.equal(x.statements.find(q=>q.sql.includes('INSERT INTO audit_logs'))?.params[0],'99');
  assert.ok(!x.statements.some(q=>q.sql.includes('UPDATE ai_humas_model_selections')||q.sql.includes('UPDATE ai_models')),'balance does not change Humas model choices or model status');
 }finally{await x.app.close();}
});
test('activation error rolls back balance and does not report success',async()=>{
 const x=await fixture({failActivation:true});
 try{
  const result=await x.app.inject({method:'POST',url:'/api/admin/ai/manual-balances',headers,payload:{providerCode:'openai',balanceUsd:10,reason:'Top up saldo provider'}});
  assert.equal(result.statusCode,503);assert.equal(result.json().error,'AI_MANUAL_BALANCE_SAVE_FAILED');
  assert.ok(x.statements.some(q=>q.sql==='ROLLBACK'));assert.ok(!x.statements.some(q=>q.sql==='COMMIT'||q.sql.includes('INSERT INTO audit_logs')));
 }finally{await x.app.close();}
});
test('ambiguous budget does not activate provider',async()=>{
 const x=await fixture({ambiguous:true});
 try{
  const result=await x.app.inject({method:'POST',url:'/api/admin/ai/manual-balances',headers,payload:{providerCode:'anthropic',balanceUsd:10,reason:'Top up saldo provider'}});
  assert.equal(result.statusCode,409);assert.equal(result.json().error,'AI_BUDGET_AMBIGUOUS');
  assert.ok(!x.statements.some(q=>q.sql.includes('UPDATE ai_providers')||q.sql==='COMMIT'));
 }finally{await x.app.close();}
});
test('Humas cannot activate a paid provider by submitting a balance',async()=>{
 const x=await fixture({role:'humas'});
 try{
  const result=await x.app.inject({method:'POST',url:'/api/admin/ai/manual-balances',headers,payload:{providerCode:'openai',balanceUsd:10,reason:'Top up saldo provider'}});
  assert.equal(result.statusCode,403);assert.equal(x.connections(),0);
 }finally{await x.app.close();}
});
test('invalid balance cannot activate provider',async()=>{
 const x=await fixture();
 try{
  const result=await x.app.inject({method:'POST',url:'/api/admin/ai/manual-balances',headers,payload:{providerCode:'openai',balanceUsd:-1,reason:'Top up saldo provider'}});
  assert.equal(result.statusCode,400);assert.equal(x.connections(),0);
 }finally{await x.app.close();}
});
