import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyApifyLedgerRun} from './apify-ledger-run-verification.js';
const base={runId:'run_12345',actorId:'clockworks/tiktok-scraper' as const,platform:'tiktok' as const};
test('accepts only exact authorized ledger run',async()=>{
 await verifyApifyLedgerRun({query:async()=>({rows:[{reservation_key:'reservation-1',actor_id:base.actorId,platform:'tiktok',status:'RUNNING',run_id:base.runId}]})} as never,base);
});
test('rejects untracked provider run',async()=>{
 await assert.rejects(verifyApifyLedgerRun({query:async()=>({rows:[]})} as never,base),/APIFY_LEDGER_RUN_NOT_UNIQUELY_AUTHORIZED/);
});
test('rejects provisional or unknown run',async()=>{
 await assert.rejects(verifyApifyLedgerRun({query:async()=>({rows:[{reservation_key:'reservation-1',actor_id:base.actorId,platform:'tiktok',status:'UNKNOWN',run_id:base.runId}]})} as never,base),/APIFY_LEDGER_RUN_NOT_AUTHORIZED/);
});
