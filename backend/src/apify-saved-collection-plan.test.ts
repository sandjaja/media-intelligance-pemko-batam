import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {planSavedApifyCollection} from './apify-saved-collection-plan.js';
const budget={monthlyBudgetUsd:4,spentUsd:0,pendingReservedUsd:0,estimatedNextRunUsd:0.5,providerBalanceUsd:4,credentialsVerified:true,actorConfigured:true};
const settings={tiktokActor:'clockworks/tiktok-scraper',instagramActor:'apify/instagram-scraper',tiktokCommentsActor:'clockworks/tiktok-comments-scraper',instagramCommentsActor:'apidojo/instagram-comments-scraper-api',tiktokHashtagActor:'clockworks/tiktok-hashtag-scraper',instagramHashtagActor:'apify/instagram-hashtag-scraper'};
test('saved checkbox includes only selected hashtag in a non-executable plan',async()=>{
 const pool={query:async()=>({rows:[{settings:{...settings,tiktokHashtagEnabled:true,instagramHashtagEnabled:false}}]})} as unknown as Pool;
 const result=await planSavedApifyCollection(pool,budget);
 assert.deepEqual(result.scheduled,['tiktok_posts','instagram_posts','tiktok_comments','instagram_comments','tiktok_hashtag']);
 assert.equal(result.ready,false);
 assert.equal(result.reason,'APIFY_ATOMIC_RESERVATION_NOT_IMPLEMENTED');
});
test('missing Admin settings block planning',async()=>{
 const pool={query:async()=>({rows:[]})} as unknown as Pool;
 const result=await planSavedApifyCollection(pool,budget);
 assert.deepEqual(result.scheduled,[]);
 assert.equal(result.reason,'APIFY_ADMIN_COLLECTORS_UNAVAILABLE');
});
