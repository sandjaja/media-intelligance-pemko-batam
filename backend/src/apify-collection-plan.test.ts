import assert from 'node:assert/strict';
import test from 'node:test';
import {planApifyCollection} from './apify-collection-plan.js';
const budget={monthlyBudgetUsd:10,spentUsd:1,pendingReservedUsd:0,estimatedNextRunUsd:0.1,providerBalanceUsd:10,credentialsVerified:true,actorConfigured:true};
test('four primary collectors remain blocked until atomic reservation exists',()=>{
 const result=planApifyCollection({budget,settings:[
 {kind:'tiktok_posts',actorId:'clockworks/tiktok-scraper',enabled:true},
 {kind:'instagram_posts',actorId:'apify/instagram-scraper',enabled:true},
 {kind:'tiktok_comments',actorId:'clockworks/tiktok-comments-scraper',enabled:true},
 {kind:'instagram_comments',actorId:'apidojo/instagram-comments-scraper-api',enabled:true},
 {kind:'instagram_hashtag',actorId:'apify/instagram-hashtag-scraper',enabled:false},
 {kind:'tiktok_hashtag',actorId:'clockworks/tiktok-scraper',enabled:false}
 ]});
 assert.equal(result.ready,false);assert.equal(result.scheduled.length,4);
 assert.equal(result.reason,'APIFY_ATOMIC_RESERVATION_NOT_IMPLEMENTED');
});
test('standby hashtag cannot be silently scheduled',()=>{
 const result=planApifyCollection({budget,settings:[{kind:'instagram_hashtag',actorId:'apify/instagram-hashtag-scraper',enabled:true}]});
 assert.equal(result.reason,'APIFY_STANDBY_REQUIRES_EXPLICIT_ACTIVATION');
});
