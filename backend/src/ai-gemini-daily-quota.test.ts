import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { reserveGeminiDailyQuota } from './phase5-strategy-routes.js';

function mockQuota(limit:number,enabled=true,available=true){
 let used=0;
 const pool={async query(sql:string,params:unknown[]=[]){
   if(sql.includes('to_regclass'))return {rows:[{available}],rowCount:1};
   if(sql.includes('SELECT l.model_id,l.max_requests'))return {rows:[{model_id:7,max_requests:limit,enabled}],rowCount:1};
   if(sql.includes('INSERT INTO ai_free_tier_daily_usage')){
     assert.deepEqual(params,[7]);
     if(used>=limit)return {rows:[],rowCount:0};
     used+=1;
     return {rows:[{reserved_requests:used}],rowCount:1};
   }
   throw new Error('UNEXPECTED_SQL');
 }};
 return {pool:pool as unknown as Pick<Pool,'query'>,used:()=>used};
}

test('disabled quota blocks calls',async()=>{
 const x=mockQuota(1,false);
 await assert.rejects(reserveGeminiDailyQuota(x.pool,'gemini-test'),/AI_GEMINI_DAILY_QUOTA_DISABLED/);
 assert.equal(x.used(),0);
});

test('unapplied quota migration blocks calls',async()=>{
 const x=mockQuota(1,true,false);
 await assert.rejects(reserveGeminiDailyQuota(x.pool,'gemini-test'),/AI_GEMINI_DAILY_QUOTA_NOT_CONFIGURED/);
 assert.equal(x.used(),0);
});

test('quota rejects requests after the configured limit',async()=>{
 const x=mockQuota(2);
 await reserveGeminiDailyQuota(x.pool,'gemini-test');
 await reserveGeminiDailyQuota(x.pool,'gemini-test');
 await assert.rejects(reserveGeminiDailyQuota(x.pool,'gemini-test'),/AI_GEMINI_DAILY_QUOTA_EXCEEDED/);
 assert.equal(x.used(),2);
});

test('concurrent reservations never exceed configured limit',async()=>{
 const x=mockQuota(3);
 const outcomes=await Promise.allSettled(Array.from({length:10},()=>reserveGeminiDailyQuota(x.pool,'gemini-test')));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,3);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,7);
 assert.equal(x.used(),3);
});
