import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {reconcileApifyRun} from './apify-cost-reconciliation.js';

function mockPool(rowCount:number){
 const calls:{sql:string;params:unknown[]}[]=[];
 const pool={query:async(sql:string,params:unknown[])=>{
  calls.push({sql,params});return{rowCount,rows:[]};
 }} as unknown as Pool;
 return{pool,calls};
}
const base={reservationKey:'reservation-1',runId:'apify-run-1'};
test('reconciles provider-confirmed completed run',async()=>{
 const {pool,calls}=mockPool(1);
 const result=await reconcileApifyRun(pool,{...base,status:'SUCCEEDED',actualUsd:0.25});
 assert.deepEqual(result,{updated:true,reason:'APIFY_RECONCILED'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].params[3],0.25);
 assert.ok(calls[0].sql.includes("status IN ('RESERVED','RUNNING','UNKNOWN')"));
});
test('requires confirmed cost for final failed run',async()=>{
 const {pool,calls}=mockPool(1);
 const result=await reconcileApifyRun(pool,{...base,status:'FAILED',actualUsd:null});
 assert.equal(result.reason,'APIFY_FINAL_COST_UNVERIFIED');
 assert.equal(calls.length,0);
});
test('allows unknown cost to remain reserved',async()=>{
 const {pool,calls}=mockPool(1);
 const result=await reconcileApifyRun(pool,{...base,status:'UNKNOWN',actualUsd:null});
 assert.equal(result.updated,true);
 assert.equal(calls[0].params[3],null);
});
test('rejects negative provider cost',async()=>{
 const {pool,calls}=mockPool(1);
 const result=await reconcileApifyRun(pool,{...base,status:'SUCCEEDED',actualUsd:-1});
 assert.equal(result.reason,'APIFY_RECONCILE_INVALID_COST');
 assert.equal(calls.length,0);
});
test('does not overwrite finalized or missing ledger entries',async()=>{
 const {pool}=mockPool(0);
 const result=await reconcileApifyRun(pool,{...base,status:'SUCCEEDED',actualUsd:0.2});
 assert.equal(result.reason,'APIFY_RESERVATION_NOT_FOUND_OR_FINAL');
});
