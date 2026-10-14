import assert from 'node:assert/strict';
import test from 'node:test';
import {ingestCompletedApifyTikTokDataset} from './apify-tiktok-dataset.js';
import {ingestCompletedApifyInstagramDataset} from './apify-instagram-dataset.js';

for(const [platform,actorSlug,actorInternalId,ingest,item] of [
 ['tiktok','clockworks~tiktok-scraper','actor_tiktok123',ingestCompletedApifyTikTokDataset,{
  id:'7345678901234567890',text:'Konser di Bandung Jawa Barat',
  webVideoUrl:'https://www.tiktok.com/@example/video/7345678901234567890'
 }],
 ['instagram','apify~instagram-scraper','actor_instagram123',ingestCompletedApifyInstagramDataset,{
  shortCode:'ABCdef123',caption:'Festival di Bandung Jawa Barat',
  url:'https://www.instagram.com/reel/ABCdef123/'
 }]
] as const){
 test(platform+' verified run imports zero unrelated posts without DB writes',async()=>{
  const queries:string[]=[];
  const pool={query:async(sql:string)=>{
   queries.push(sql);
   if(sql.includes('FROM apify_usage_ledger'))return{rows:[{
    reservation_key:'reservation_123',actor_id:platform==='tiktok'?'clockworks/tiktok-scraper':'apify/instagram-scraper',
    platform,status:'RUNNING',run_id:'run_12345'
   }]};
   if(sql.includes('FROM organizations'))return{rows:[{id:1,name:'Pemerintah Kota Batam',code:'batam'}]};
   if(sql.includes('FROM government_branding'))return{rows:[{government_name:'Pemerintah Kota Batam',short_name:'Pemko Batam',city_name:'Batam',aliases:[]}]};
   return{rows:[]};
  }};
  const calls:string[]=[];
  const fetcher=async(url:URL|string|Request)=>{
   const path=new URL(String(url)).pathname;
   calls.push(path);
   if(path==='/v2/acts/'+actorSlug)return{ok:true,json:async()=>({data:{id:actorInternalId}})} as Response;
   if(path==='/v2/actor-runs/run_12345')return{ok:true,json:async()=>({data:{
    id:'run_12345',status:'SUCCEEDED',defaultDatasetId:'dataset_12345',actId:actorInternalId
   }})} as Response;
   if(path==='/v2/datasets/dataset_12345/items')return{ok:true,json:async()=>[item]} as Response;
   throw Error('UNEXPECTED_PROVIDER_PATH');
  };
  const result=await ingest(pool as never,{datasetId:'dataset_12345',confirmedRunId:'run_12345',token:'dummy',fetcher:fetcher as typeof fetch});
  assert.equal(result.datasetItems,1);
  assert.equal(result.outOfScope,1);
  assert.equal(result.received,0);
  assert.deepEqual(calls,[
   '/v2/acts/'+actorSlug,'/v2/actor-runs/run_12345','/v2/datasets/dataset_12345/items'
  ]);
  assert.equal(queries.some(sql=>/INSERT|UPDATE|DELETE/i.test(sql)),false);
 });
}
