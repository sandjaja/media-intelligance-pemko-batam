import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchApifyTikTokDataset} from './apify-tiktok-dataset.js';

test('fetches bounded TikTok dataset items without exposing token in URL',async()=>{
 let calls=0;
 const items=await fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret-token',limit:2,
  fetcher:async(input,init)=>{
   calls++;
   const url=new URL(String(input));
   assert.equal(url.hostname,'api.apify.com');
   assert.equal(url.pathname,'/v2/datasets/dataset_12345/items');
   assert.equal(url.searchParams.get('limit'),'2');
   assert.equal(url.searchParams.has('token'),false);
   assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret-token');
   return{ok:true,json:async()=>[{id:'7345678901234567890',text:'Batam'}]} as Response;
  }});
 assert.equal(calls,1);
 assert.equal(items.length,1);
});
test('rejects malformed dataset ID and oversized limit before network access',async()=>{
 let called=false;
 const fetcher=async()=>{called=true;throw Error('UNEXPECTED_NETWORK')};
 await assert.rejects(fetchApifyTikTokDataset({datasetId:'../other',token:'secret',fetcher}),/APIFY_DATASET_ID_INVALID/);
 await assert.rejects(fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret',limit:101,fetcher}),/APIFY_DATASET_LIMIT_INVALID/);
 assert.equal(called,false);
});
test('rejects invalid provider dataset response shape',async()=>{
 await assert.rejects(fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret',fetcher:async()=>({ok:true,json:async()=>({data:[]})} as Response)}),/APIFY_DATASET_SHAPE_INVALID/);
});
