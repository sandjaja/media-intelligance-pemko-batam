import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {previewManualApifyCollection} from './apify-manual-preview.js';
test('manual TikTok preview includes enabled hashtag and excludes Instagram',async()=>{
 const settings={tiktokActor:'clockworks/tiktok-scraper',tiktokCommentsActor:'clockworks/tiktok-comments-scraper',tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',tiktokHashtagEnabled:true,instagramActor:'apify/instagram-scraper',instagramCommentsActor:'apidojo/instagram-comments-scraper-api',instagramHashtagActor:'apify/instagram-hashtag-scraper',instagramHashtagEnabled:false};
 const pool={query:async()=>({rows:[{settings}]})} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'tiktok',requestedBy:'operator-1'});
 assert.deepEqual(result.collectors,['tiktok_posts','tiktok_comments','tiktok_hashtag']);
 assert.equal(result.actorDetails.length,3);
 assert.equal(result.actorDetails[0]?.actorId,'clockworks/tiktok-scraper');
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED');
});
test('manual preview fails closed without saved settings',async()=>{
 const pool={query:async()=>({rows:[]})} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'instagram',requestedBy:'operator-1'});
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_ADMIN_COLLECTORS_UNAVAILABLE');
});

test('manual preview reports missing credentials and pricing metadata without attempting paid run',async()=>{
 const settings={tiktokActor:'clockworks/tiktok-scraper',tiktokCommentsActor:'clockworks/tiktok-comments-scraper'};
 const pool={query:async(sql:string)=>sql.includes('integration_credentials')?{rows:[]}:{rows:[{settings}]}} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'tiktok',requestedBy:'operator-1'});
 assert.equal(result.billableRunStarted,false);
 assert.ok(result.executionBlockers.includes('APIFY_CREDENTIAL_UNAVAILABLE'));
 assert.ok(result.executionBlockers.includes('APIFY_ACTOR_PRICING_METADATA_UNAVAILABLE'));
 assert.ok(result.actorDetails.every(actor=>actor.pricingModel===null));
});

test('duplicate Actor ID across TikTok and Instagram is flagged even for TikTok-only preview',async()=>{
 const settings={tiktokActor:'clockworks/tiktok-scraper',instagramActor:'clockworks/tiktok-scraper',tiktokCommentsEnabled:false,instagramCommentsEnabled:false};
 const pool={query:async(sql:string)=>sql.includes('integration_credentials')?{rows:[]}:{rows:[{settings}]}} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'tiktok',requestedBy:'operator-1'});
 assert.ok(result.executionBlockers.includes('APIFY_ACTOR_ID_AMBIGUOUS'));
 assert.equal(result.billableRunStarted,false);
});

test('read-only pricing preview does not require paid collector enabled flag',async()=>{
 const queries:string[]=[];
 const pool={query:async(sql:string)=>{queries.push(sql);return{rows:[]};}} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'instagram',requestedBy:'operator-1'});
 const credentialQuery=queries.find(sql=>sql.includes('SELECT c.credential_ciphertext')&&!sql.includes('c.enabled=true'));
 assert.ok(credentialQuery);
 assert.equal(credentialQuery.includes('c.enabled=true'),false);
 assert.equal(result.billableRunStarted,false);
 assert.equal(result.ready,false);
});
