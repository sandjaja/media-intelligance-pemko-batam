import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveApifyActorInternalId} from './apify-actor-identity.js';
test('resolves internal Actor ID from trusted slug without URL token',async()=>{
 const id=await resolveApifyActorInternalId({actorId:'apify/instagram-scraper',token:'secret',fetcher:async(url,init)=>{
  assert.equal(String(url),'https://api.apify.com/v2/acts/apify~instagram-scraper');
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer secret');
  return{ok:true,json:async()=>({data:{id:'actor_12345'}})} as Response;
 }});
 assert.equal(id,'actor_12345');
});
test('rejects missing internal Actor ID',async()=>{
 await assert.rejects(resolveApifyActorInternalId({actorId:'clockworks/tiktok-scraper',token:'secret',fetcher:async()=>({ok:true,json:async()=>({data:{name:'tiktok-scraper'}})} as Response)}),/APIFY_ACTOR_INTERNAL_ID_INVALID/);
});
