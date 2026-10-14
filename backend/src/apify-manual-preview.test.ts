import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {previewManualApifyCollection} from './apify-manual-preview.js';
test('manual TikTok preview includes enabled hashtag and excludes Instagram',async()=>{
 const settings={tiktokActor:'clockworks/tiktok-scraper',tiktokCommentsActor:'clockworks/tiktok-comments-scraper',tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',tiktokHashtagEnabled:true,instagramActor:'apify/instagram-scraper',instagramCommentsActor:'apidojo/instagram-comments-scraper-api',instagramHashtagActor:'apify/instagram-hashtag-scraper',instagramHashtagEnabled:false};
 const pool={query:async()=>({rows:[{settings}]})} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'tiktok',requestedBy:'operator-1'});
 assert.deepEqual(result.collectors,['tiktok_posts','tiktok_comments','tiktok_hashtag']);
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED');
});
test('manual preview fails closed without saved settings',async()=>{
 const pool={query:async()=>({rows:[]})} as unknown as Pool;
 const result=await previewManualApifyCollection(pool,{platform:'instagram',requestedBy:'operator-1'});
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_ADMIN_COLLECTORS_UNAVAILABLE');
});
