import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {confirmApifyProviderRun,markApifyRunUnknown} from './apify-run-lifecycle.js';
const claim={reservationKey:'manual:1',claimId:'claim:abcdefgh1234'};
test('confirmed run replaces claim id only while RUNNING',async()=>{
 let sql='',args:unknown[]=[];
 const pool={query:async(q:string,p:unknown[])=>{sql=q;args=p;return{rows:[{id:1}]}}} as unknown as Pool;
 const result=await confirmApifyProviderRun(pool,{...claim,providerRunId:'providerRun123'});
 assert.equal(result.confirmed,true);
 assert.match(sql,/status='RUNNING'/);
 assert.deepEqual(args,[claim.reservationKey,claim.claimId,'providerRun123']);
});
test('uncertain response marks UNKNOWN without refunding reservation',async()=>{
 let sql='';
 const pool={query:async(q:string)=>{sql=q;return{rows:[{id:1}]}}} as unknown as Pool;
 const result=await markApifyRunUnknown(pool,{...claim,reason:'timeout'});
 assert.equal(result.marked,true);
 assert.match(sql,/status='UNKNOWN'/);
 assert.doesNotMatch(sql,/reserved_usd\s*=/);
});
test('invalid provider ids and already-claimed rows fail closed',async()=>{
 const pool={query:async()=>({rows:[]})} as unknown as Pool;
 assert.equal((await confirmApifyProviderRun(pool,{...claim,providerRunId:'bad'})).confirmed,false);
 assert.equal((await confirmApifyProviderRun(pool,{...claim,providerRunId:'providerRun123'})).confirmed,false);
});
