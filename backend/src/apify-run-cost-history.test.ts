import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchApifyActorCostHistory} from './apify-run-cost-history.js';

const sample=(id:string,cost:number,items:number)=>({id,status:'SUCCEEDED',finishedAt:'2026-10-15T00:00:00.000Z',usageTotalUsd:cost,actId:'ACTOR123',stats:{outputItems:items}});
test('history estimates target counts only from completed runs with known output',async()=>{
 const fetcher=(async(url:string)=>({ok:true,json:async()=>url.includes('/runs')?({data:{items:[sample('a',0.2,10),sample('b',0.4,20),sample('c',0.6,30)]}}):({data:{id:'ACTOR123'}})})) as unknown as typeof fetch;
 const result=await fetchApifyActorCostHistory({token:'test-token',actorId:'clockworks/tiktok-scraper',fetcher});
 assert.equal(result.costKnownCount,3);
 assert.equal(result.costPerItemSampleCount,3);
 assert.ok(Math.abs(result.estimatedCostsUsd!['20']-0.4)<1e-9);
});
test('history does not fabricate estimates when output count is missing',async()=>{
 const fetcher=(async(url:string)=>({ok:true,json:async()=>url.includes('/runs')?({data:{items:[{actId:'ACTOR123',id:'a',status:'SUCCEEDED',finishedAt:'2026-10-15T00:00:00.000Z',usageTotalUsd:0.2}]}}):({data:{id:'ACTOR123'}})})) as unknown as typeof fetch;
 const result=await fetchApifyActorCostHistory({token:'test-token',actorId:'apify/instagram-scraper',fetcher});
 assert.equal(result.estimatedCostsUsd,null);
 assert.equal(result.costPerItemSampleCount,0);
});

test('history ignores cost detail belonging to a different Actor',async()=>{
 const fetcher=(async(url:string)=>({ok:true,json:async()=>url.includes('/actor-runs/')?({data:{id:'a',actId:'OTHER_ACTOR',status:'SUCCEEDED',usageTotalUsd:99,stats:{outputItems:1}}}):url.includes('/runs')?({data:{items:[{id:'a',actId:'ACTOR123',status:'SUCCEEDED',finishedAt:'2026-10-15T00:00:00.000Z'}]}}):({data:{id:'ACTOR123'}})})) as unknown as typeof fetch;
 const result=await fetchApifyActorCostHistory({token:'test-token',actorId:'clockworks/tiktok-scraper',fetcher});
 assert.equal(result.costKnownCount,0);
 assert.equal(result.estimatedCostsUsd,null);
 assert.equal(result.partial,true);
});
