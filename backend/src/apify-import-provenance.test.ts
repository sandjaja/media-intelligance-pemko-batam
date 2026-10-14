import assert from 'node:assert/strict';
import test from 'node:test';
import {ingestCompletedApifyTikTokDataset} from './apify-tiktok-dataset.js';
import {ingestCompletedApifyInstagramDataset} from './apify-instagram-dataset.js';

for(const [platform,ingest] of [
 ['TikTok',ingestCompletedApifyTikTokDataset],
 ['Instagram',ingestCompletedApifyInstagramDataset],
] as const){
 test(platform+' refuses untracked run before any Apify HTTP call',async()=>{
  let networkCalls=0;
  const pool={query:async()=>({rows:[]})};
  const fetcher=async()=>{networkCalls++;throw Error('UNEXPECTED_PROVIDER_NETWORK')};
  await assert.rejects(ingest(pool as never,{
   datasetId:'dataset_12345',token:'dummy',confirmedRunId:'run_12345',fetcher
  }),/APIFY_LEDGER_RUN_NOT_UNIQUELY_AUTHORIZED/);
  assert.equal(networkCalls,0);
 });
 test(platform+' refuses UNKNOWN ledger run before any Apify HTTP call',async()=>{
  let networkCalls=0;
  const actorId=platform==='TikTok'?'clockworks/tiktok-scraper':'apify/instagram-scraper';
  const pool={query:async()=>({rows:[{
   reservation_key:'reservation_123',actor_id:actorId,
   platform:platform.toLowerCase(),status:'UNKNOWN',run_id:'run_12345'
  }]})};
  const fetcher=async()=>{networkCalls++;throw Error('UNEXPECTED_PROVIDER_NETWORK')};
  await assert.rejects(ingest(pool as never,{
   datasetId:'dataset_12345',token:'dummy',confirmedRunId:'run_12345',fetcher
  }),/APIFY_LEDGER_RUN_NOT_AUTHORIZED/);
  assert.equal(networkCalls,0);
 });
}
