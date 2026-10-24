import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import {scheduledSocialPlatforms} from './social-scheduler-platforms.js';
import {registerCollectionSchedulerRoutes} from './collection-scheduler-routes.js';

test('existing scheduler keeps all platforms; explicit empty and duplicate choices are normalized safely',()=>{
 assert.deepEqual(scheduledSocialPlatforms(undefined),['youtube','instagram','tiktok']);assert.deepEqual(scheduledSocialPlatforms([]),[]);assert.deepEqual(scheduledSocialPlatforms(['tiktok','tiktok']),['tiktok']);
 for(const invalid of ['instagram',['unknown'],[1]])assert.throws(()=>scheduledSocialPlatforms(invalid),/INVALID_SCHEDULER/);
});
test('admin saves platform selection in the scheduler config without enabling the master scheduler',async()=>{
 const updates:any[]=[];const pool={query:async(sql:string,params:any[]=[])=>{
  if(sql.includes('FROM users u'))return{rows:[{id:'1',role:'admin',active:true,roles:['super_admin'],permissions:[]}]};
  if(sql.startsWith('UPDATE collection_scheduler_config')){updates.push(params);return{rows:[{enabled:params[0],social_platforms:params[6]}]};}
  return{rows:[]};
 }} as any;
 const app=Fastify();await app.register(cookie);await registerCollectionSchedulerRoutes(app,pool,'test');const headers={cookie:'access_token='+jwt.sign({sub:'1'},'test')};
 const payload={enabled:false,runTime:'08:00',onlineEnabled:false,ownedEnabled:false,socialEnabled:true,socialPlatforms:['youtube']};
 try{
  const r=await app.inject({method:'PUT',url:'/api/admin/collection-scheduler',headers,payload});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().data.social_platforms,['youtube']);assert.equal(r.json().data.enabled,false);
  for(const platforms of [[],['unknown']])assert.equal((await app.inject({method:'PUT',url:'/api/admin/collection-scheduler',headers,payload:{...payload,socialPlatforms:platforms}})).statusCode,400);
  assert.equal(updates.length,1);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/collection-scheduler/run',headers,payload:{sources:['social'],socialPlatforms:[]}})).statusCode,400);
 }finally{await app.close();}
});
