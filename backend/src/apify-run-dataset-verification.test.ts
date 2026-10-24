import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyCompletedApifyRunDataset} from './apify-run-dataset-verification.js';
const base={runId:'run_12345',datasetId:'dataset_12345',actorId:'apify/instagram-scraper' as const,expectedActorInternalId:'actor_12345',token:'secret'};
test('accepts only succeeded run with matching dataset and trusted internal Actor identity',async()=>{
 await verifyCompletedApifyRunDataset({...base,fetcher:async()=>({ok:true,json:async()=>({data:{id:base.runId,status:'SUCCEEDED',defaultDatasetId:base.datasetId,actId:base.expectedActorInternalId}})} as Response)});
});
test('rejects wrong Actor even when run and dataset IDs match',async()=>{
 await assert.rejects(verifyCompletedApifyRunDataset({...base,fetcher:async()=>({ok:true,json:async()=>({data:{id:base.runId,status:'SUCCEEDED',defaultDatasetId:base.datasetId,actId:'other_actor'}})} as Response)}),/APIFY_RUN_ACTOR_IDENTITY_MISMATCH/);
});
test('rejects unfinished runs',async()=>{
 await assert.rejects(verifyCompletedApifyRunDataset({...base,fetcher:async()=>({ok:true,json:async()=>({data:{id:base.runId,status:'RUNNING',defaultDatasetId:base.datasetId,actId:base.expectedActorInternalId}})} as Response)}),/APIFY_RUN_DATASET_PROVENANCE_MISMATCH/);
});
