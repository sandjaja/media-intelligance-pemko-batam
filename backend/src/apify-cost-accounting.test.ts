import assert from 'node:assert/strict';
import test from 'node:test';
import {apifyMonthUtc,summarizeApifyUsage} from './apify-cost-accounting.js';
test('summarizes monthly settled and reserved Apify costs',()=>{
 const r=summarizeApifyUsage([
  {runId:'a',actorId:'tiktok',startedAt:'2026-10-01T00:00:00Z',costUsd:0.2,status:'SUCCEEDED'},
  {runId:'b',actorId:'instagram',startedAt:'2026-10-02T00:00:00Z',costUsd:0.3,status:'RUNNING'},
  {runId:'c',actorId:'tiktok',startedAt:'2026-09-30T00:00:00Z',costUsd:1,status:'FAILED'}
 ],'2026-10');
 assert.equal(r.spentUsd,0.2);assert.equal(r.runningCostUsd,0.3);assert.equal(r.completedRuns,1);assert.equal(r.runningRuns,1);
});
test('rejects duplicate runs and unknown costs',()=>{
 const row={runId:'a',actorId:'tiktok',startedAt:'2026-10-01T00:00:00Z',costUsd:0.2,status:'SUCCEEDED' as const};
 assert.throws(()=>summarizeApifyUsage([row,row],'2026-10'),/INVALID_APIFY_LEDGER_ENTRY/);
 assert.throws(()=>summarizeApifyUsage([{...row,costUsd:NaN}],'2026-10'),/INVALID_APIFY_LEDGER_ENTRY/);
});
test('uses UTC billing month',()=>assert.equal(apifyMonthUtc(new Date('2026-10-01T00:00:00Z')),'2026-10'));
