import assert from 'node:assert/strict';
import test from 'node:test';
import {parseApifyActorReference,resolveApifyActorReference,normalizeApifyActorSettings,matchingActorAdapter} from './apify-actor-reference.js';
const id='GdWCkxBtKWOsKjdch';
const adapter={actorId:'clockworks/tiktok-scraper',inputTemplate:{searchQueries:'{{queries}}'},output:{id:['id'],text:['text'],publishedAt:['createTime'],url:['webVideoUrl']}};
const saved={tiktokActor:adapter.actorId,actorAdapters:{tiktok_posts:adapter}};

test('accepts Console input links, Store links, slugs, and internal Actor IDs',()=>{
 for(const value of ['https://console.apify.com/actors/'+id+'/input','https://console.apify.com/actors/'+id+'/input?tab=form',id])assert.equal(parseApifyActorReference(value),id);
 for(const value of ['https://apify.com/clockworks/tiktok-scraper','https://apify.com/clockworks/tiktok-scraper/input-schema','clockworks/tiktok-scraper','clockworks~tiktok-scraper'])assert.equal(parseApifyActorReference(value),'clockworks/tiktok-scraper');
});
test('rejects third-party hosts, credentials, Run links, and Dataset links',()=>{
 for(const value of ['https://console.apify.com.evil.test/actors/'+id+'/input','https://evil.test/clockworks/tiktok-scraper','http://apify.com/clockworks/tiktok-scraper','https://user:secret@apify.com/clockworks/tiktok-scraper','https://console.apify.com/actors/'+id+'/runs/run123','https://console.apify.com/storage/datasets/'+id,'https://api.apify.com/v2/actor-runs/'+id])assert.throws(()=>parseApifyActorReference(value));
});
test('resolves only via metadata GET and sends credentials in header only',async()=>{
 let calls=0;const r=await resolveApifyActorReference('https://console.apify.com/actors/'+id+'/input','secret',async(url,options)=>{
  calls++;assert.equal(String(url),'https://api.apify.com/v2/actors/'+id);assert.equal(options?.method,'GET');assert.equal(options?.redirect,'error');assert.equal((options?.headers as any).Authorization,'Bearer secret');assert.equal(String(url).includes('secret'),false);
  return new Response(JSON.stringify({data:{id,username:'clockworks',name:'tiktok-scraper',title:'TikTok Scraper'}}),{status:200});
 });assert.equal(r.actorId,adapter.actorId);assert.equal(calls,1);
});
test('rejects mismatched metadata and never returns the token',async()=>{
 await assert.rejects(resolveApifyActorReference(id,'secret',async()=>new Response(JSON.stringify({data:{id:'aaaaaaaaaaaaaaaaa',username:'clockworks',name:'tiktok-scraper'}}))),/Identitas Actor tidak sesuai/);
 await assert.rejects(resolveApifyActorReference(id,'secret',async()=>{throw Error('secret network error');}),e=>e instanceof Error&&!e.message.includes('secret'));
});
test('pasting the same Actor Console link reuses the saved adapter without changing input/output',async()=>{
 const before=JSON.stringify(saved);let calls=0;
 const result=await normalizeApifyActorSettings({tiktokActor:'https://console.apify.com/actors/'+id+'/input',tiktokPostsEnabled:true},saved,async()=>'secret',async()=>{calls++;return new Response(JSON.stringify({data:{id,username:'clockworks',name:'tiktok-scraper'}}));});
 assert.equal(result.tiktokActor,adapter.actorId);assert.deepEqual(result.actorAdapters.tiktok_posts,adapter);assert.equal(calls,1);assert.equal(JSON.stringify(saved),before);
});
test('saving a known Store link requires neither token nor paid run',async()=>{
 const r=await normalizeApifyActorSettings({tiktokActor:'https://apify.com/clockworks/tiktok-scraper',tiktokPostsEnabled:true},saved,async()=>{throw Error('Token should not be needed');},async()=>{throw Error('No network call expected');});assert.equal(r.tiktokActor,adapter.actorId);
});
test('unknown Actor cannot silently inherit the previous Actor template',async()=>{
 await assert.rejects(normalizeApifyActorSettings({tiktokActor:'other/new-actor',tiktokPostsEnabled:true},saved,async()=>''),/Perlu penyesuaian teknis/);
 assert.throws(()=>matchingActorAdapter('instagram_posts',adapter.actorId,saved.actorAdapters),/Perlu penyesuaian teknis/);
 assert.equal(saved.tiktokActor,adapter.actorId);
});
test('explicit matching technical adapter remains supported',async()=>{
 const custom={...adapter,actorId:'other/new-actor'};
 const r=await normalizeApifyActorSettings({tiktokActor:custom.actorId,tiktokPostsEnabled:true,actorAdapters:{tiktok_posts:custom}},saved,async()=>'');assert.deepEqual(r.actorAdapters.tiktok_posts,custom);
});
