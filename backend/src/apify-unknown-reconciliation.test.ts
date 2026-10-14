import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {reconcileUnknownApifyRun} from './apify-unknown-reconciliation.js';
const key='reservation-test',run='runABCDE123';
function setup(runId=run,cost:unknown=0.23,status='SUCCEEDED'){
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);return sql.includes('SELECT status,run_id,reserved_usd')?
  {rows:[{status:'UNKNOWN',run_id:runId,reserved_usd:'0.5'}]}:{rowCount:1,rows:[{id:1}]};}} as unknown as Pool;
 const fetchImpl=(async(_url:string,opts:RequestInit)=>{
  assert.equal(opts.method,'GET');
  return{ok:true,json:async()=>({data:{id:run,status,usageTotalUsd:cost}})};
 }) as unknown as typeof fetch;
 return{pool,fetchImpl,queries};
}
test('verified terminal provider cost reconciles ledger',async()=>{
 const x=setup();
 const result=await reconcileUnknownApifyRun(x.pool,{reservationKey:key,token:'token',fetchImpl:x.fetchImpl});
 assert.equal(result.updated,true);
 assert.equal(x.queries.length,2);
 assert.match(x.queries[1],/status IN \('RUNNING','UNKNOWN'\)/);
});
test('unconfirmed provisional claim never triggers provider GET or ledger update',async()=>{
 const x=setup('claim:abcdefgh1234');
 const result=await reconcileUnknownApifyRun(x.pool,{reservationKey:key,token:'token',fetchImpl:x.fetchImpl});
 assert.equal(result.updated,false);
 assert.equal(x.queries.length,1);
});
test('unknown final cost cannot finalize ledger',async()=>{
 const x=setup(run,undefined);
 const result=await reconcileUnknownApifyRun(x.pool,{reservationKey:key,token:'token',fetchImpl:x.fetchImpl});
 assert.equal(result.updated,false);
 assert.equal(x.queries.length,1);
});
test('running provider status does not finalize ledger',async()=>{
 const x=setup(run,0.1,'RUNNING');
 const result=await reconcileUnknownApifyRun(x.pool,{reservationKey:key,token:'token',fetchImpl:x.fetchImpl});
 assert.equal(result.reason,'APIFY_PROVIDER_RUN_NOT_FINAL');
 assert.equal(x.queries.length,1);
});
