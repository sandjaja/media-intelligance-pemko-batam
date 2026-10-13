import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
const base={tiktokActor:'clockworks/tiktok-scraper',instagramActor:'apify/instagram-scraper',tiktokCommentsActor:'clockworks/tiktok-comments-scraper',instagramCommentsActor:'apidojo/instagram-comments-scraper-api',tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',instagramHashtagActor:'apify/instagram-hashtag-scraper'};
test('unchecked hashtag stays disabled; checked hashtag joins planning settings',async()=>{
 const pool={query:async()=>({rows:[{settings:{...base,tiktokHashtagEnabled:true,instagramHashtagEnabled:false}}]})} as unknown as Pool;
 const settings=await loadApifyAdminCollectorSettings(pool);
 assert.equal(settings.length,6);
 assert.equal(settings.find(x=>x.kind==='tiktok_hashtag')?.enabled,true);
 assert.equal(settings.find(x=>x.kind==='instagram_hashtag')?.enabled,false);
});
test('missing checkbox defaults to disabled and ambiguous org fails closed',async()=>{
 const pool={query:async()=>({rows:[{settings:base}]})} as unknown as Pool;
 const settings=await loadApifyAdminCollectorSettings(pool);
 assert.equal(settings.find(x=>x.kind==='tiktok_hashtag')?.enabled,false);
 const ambiguous={query:async()=>({rows:[{settings:base},{settings:base}]})} as unknown as Pool;
 assert.deepEqual(await loadApifyAdminCollectorSettings(ambiguous),[]);
});
