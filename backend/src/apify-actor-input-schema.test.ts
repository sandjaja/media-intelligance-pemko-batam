import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectApifyActorInputSchema} from './apify-actor-input-schema.js';
const actorId='clockworks/tiktok-scraper' as const;
test('reads input schema keys without starting an Actor',async()=>{
 const calls:{url:string;method:string}[]=[];
 const fetcher=(async(url:URL|string,init?:RequestInit)=>{
  calls.push({url:String(url),method:init?.method??'GET'});
  return new Response(JSON.stringify({data:{properties:{searchQueries:{type:'array'},resultsPerPage:{type:'integer'}}}}),{status:200});
 }) as typeof fetch;
 const result=await inspectApifyActorInputSchema({actorId,token:'fake-test-token',fetcher});
 assert.equal(result.verified,true);
 assert.deepEqual(result.acceptedKeys,['searchQueries','resultsPerPage']);
 assert.equal(calls.length,1);
 assert.equal(calls[0].method,'GET');
 assert.match(calls[0].url,/clockworks~tiktok-scraper\/builds\/default\/input-schema$/);
});
test('fails closed for missing schema and missing token',async()=>{
 const fetcher=(async()=>new Response(JSON.stringify({data:{}}),{status:200})) as typeof fetch;
 const missing=await inspectApifyActorInputSchema({actorId,token:'test',fetcher});
 assert.equal(missing.verified,false);
 assert.equal(missing.reason,'APIFY_INPUT_SCHEMA_PROPERTIES_UNAVAILABLE');
 const noToken=await inspectApifyActorInputSchema({actorId,token:' ',fetcher});
 assert.equal(noToken.verified,false);
 assert.equal(noToken.reason,'APIFY_TOKEN_REQUIRED');
});
