import assert from 'node:assert/strict';
import test from 'node:test';
import {ingestCompletedApifyInstagramDataset} from './apify-instagram-dataset.js';
test('rejects invalid run identity before any dataset fetch',async()=>{
 let called=false;
 const fetcher=async()=>{called=true;throw Error('unexpected fetch')};
 await assert.rejects(ingestCompletedApifyInstagramDataset({} as never,{datasetId:'dataset_12345',token:'token',confirmedRunId:'../invalid',fetcher}),/APIFY_RUN_ID_INVALID/);
 assert.equal(called,false);
});
