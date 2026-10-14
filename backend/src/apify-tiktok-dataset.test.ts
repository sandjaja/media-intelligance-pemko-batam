import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchApifyTikTokDataset,resolveApifyManualImportLimit} from './apify-tiktok-dataset.js';

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

test('new manual import limit accepts only selected 10, 20 or 50',()=>{
 for(const limit of [10,20,50] as const)assert.equal(resolveApifyManualImportLimit(limit),limit);
 for(const invalid of [0,1,11,51,100,null,undefined,'10',NaN])
  assert.throws(()=>resolveApifyManualImportLimit(invalid),/APIFY_MANUAL_IMPORT_LIMIT_INVALID/);
});
test('provider response exceeding explicit manual import cap is rejected',async()=>{
 await assert.rejects(fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret',limit:10,
  fetcher:async()=>({ok:true,json:async()=>Array.from({length:11},(_,i)=>({id:i}))} as Response)}),
  /APIFY_DATASET_SHAPE_INVALID/);
});

test('historical import fetch enforces every UI video selection before normalization',async()=>{
 for(const limit of [10,20,50] as const){
  let calls=0;
  const items=await fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret',limit:resolveApifyManualImportLimit(limit),
   fetcher:async(url)=>{
    calls++;
    assert.equal(new URL(String(url)).searchParams.get('limit'),String(limit));
    return{ok:true,json:async()=>Array.from({length:limit},(_,i)=>({id:String(i)}))} as Response;
   }});
  assert.equal(calls,1);
  assert.equal(items.length,limit);
 }
});
test('historical import rejects provider over-return at 20 and 50 before ingestion',async()=>{
 for(const limit of [20,50] as const){
  await assert.rejects(fetchApifyTikTokDataset({datasetId:'dataset_12345',token:'secret',limit,
   fetcher:async()=>({ok:true,json:async()=>Array.from({length:limit+1},(_,i)=>({id:i}))} as Response)}),
   /APIFY_DATASET_SHAPE_INVALID/);
 }
});
