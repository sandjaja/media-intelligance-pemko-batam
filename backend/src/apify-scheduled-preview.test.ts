import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {previewScheduledApifyCollection} from './apify-scheduled-preview.js';
test('scheduler previews enabled Admin actors without starting billable runs',async()=>{
 const pool={query:async()=>({rows:[{settings:{
  tiktokActor:'clockworks/tiktok-scraper',instagramActor:'apify/instagram-scraper',
  tiktokCommentsActor:'clockworks/tiktok-comments-scraper',
  instagramCommentsActor:'apidojo/instagram-comments-scraper-api',
  tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',tiktokHashtagEnabled:false,
  instagramHashtagActor:'apify/instagram-hashtag-scraper',instagramHashtagEnabled:true
 }}]})} as unknown as Pool;
 const result=await previewScheduledApifyCollection(pool);
 assert.equal(result.mode,'preview_only');
 assert.equal(result.billableRunStarted,false);
 assert.equal(result.platforms[0].collectors.some(c=>c.kind==='tiktok_hashtag'),false);
 assert.equal(result.platforms[1].collectors.some(c=>c.kind==='instagram_hashtag'),true);
});
