import assert from 'node:assert/strict';
import test from 'node:test';
import {previewApifyDataset} from './apify-dataset-preview.js';

test('read-only Apify dataset preview normalizes items without starting Actor',async()=>{
 let called=0;
 const fetcher=async(input:URL|string|Request,init?:RequestInit)=>{
  called++;
  const url=new URL(String(input));
  assert.equal(url.pathname,'/v2/datasets/abcdefgh/items');
  assert.equal(init?.headers&&('authorization' in init.headers ? (init.headers as Record<string,string>).authorization : ''),'Bearer secret');
  return new Response(JSON.stringify([{id:'vid1',text:'Batam',webVideoUrl:'https://www.tiktok.com/@a/video/1'}]),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await previewApifyDataset({token:'secret',datasetId:'abcdefgh',actorRunId:'12345678',platform:'tiktok',kind:'posts',fetcher:fetcher as typeof fetch});
 assert.equal(called,1);assert.equal(result.accepted,1);assert.equal(result.candidates[0].platform,'tiktok');
});
test('dataset preview rejects malformed dataset IDs before any fetch',async()=>{
 await assert.rejects(previewApifyDataset({token:'secret',datasetId:'../runs',actorRunId:'12345678',platform:'instagram',kind:'posts'}),/INVALID_APIFY_DATASET_IDENTIFIER/);
});
