import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {inspectUnknownApifyRun} from './apify-unknown-recovery.js';
const pool=(row:unknown)=>({query:async()=>({rows:row?[row]:[]})}) as unknown as Pool;
test('UNKNOWN with confirmed provider id may be inspected without re-running',async()=>{
 const result=await inspectUnknownApifyRun(pool({status:'UNKNOWN',run_id:'apifyRun12345',reserved_usd:'0.500000'}),'key1');
 assert.equal(result.recoverable,true);
 assert.equal(result.providerRunId,'apifyRun12345');
 assert.equal(result.reservedUsd,0.5);
});
test('provisional claim ID requires manual review, never automatic retry',async()=>{
 const result=await inspectUnknownApifyRun(pool({status:'UNKNOWN',run_id:'claim:abcdefgh1234',reserved_usd:'0.500000'}),'key1');
 assert.equal(result.recoverable,false);
 assert.equal(result.reason,'APIFY_PROVIDER_RUN_ID_UNCONFIRMED_MANUAL_REVIEW');
});
test('non-unknown, missing, and empty key fail closed',async()=>{
 assert.equal((await inspectUnknownApifyRun(pool({status:'RUNNING',run_id:'run12345',reserved_usd:'0.5'}),'key1')).recoverable,false);
 assert.equal((await inspectUnknownApifyRun(pool(null),'key1')).recoverable,false);
 assert.equal((await inspectUnknownApifyRun(pool(null),'')).recoverable,false);
});
