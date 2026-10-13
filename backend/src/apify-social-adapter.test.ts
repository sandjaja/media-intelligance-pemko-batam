import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeApifyPost,normalizeApifyPosts} from './apify-social-adapter.js';
import {evaluateApifyBudget} from './apify-budget-guard.js';
test('TikTok Actor result maps to SocialCandidate',()=>{
 const row=normalizeApifyPost('tiktok',{id:'123',webVideoUrl:'https://www.tiktok.com/@a/video/123',text:'Kabar Batam',createTime:1760000000,authorMeta:{name:'akunbatam'}});
 assert.equal(row?.platform,'tiktok');assert.equal(row?.externalId,'123');assert.equal(row?.authorHandle,'akunbatam');assert.equal(row?.content,'Kabar Batam');
});
test('Instagram Actor result maps to SocialCandidate',()=>{
 const row=normalizeApifyPost('instagram',{id:'ABC',url:'https://www.instagram.com/p/ABC/',caption:'Info Batam',ownerUsername:'akunbatam'});
 assert.equal(row?.platform,'instagram');assert.equal(row?.externalId,'ABC');assert.equal(row?.content,'Info Batam');
});
test('missing identifiers rejected and duplicate items removed',()=>{
 assert.equal(normalizeApifyPost('instagram',{caption:'no id'}),null);
 assert.equal(normalizeApifyPosts('tiktok',[{id:'1',text:'a'},{id:'1',text:'b'}]).length,1);
});
test('Apify budget remains closed until atomic reservation exists',()=>{
 const decision=evaluateApifyBudget({monthlyBudgetUsd:4,spentUsd:0,pendingReservedUsd:0,estimatedNextRunUsd:0.1,providerBalanceUsd:5,credentialsVerified:true,actorConfigured:true});
 assert.equal(decision.allowed,false);assert.equal(decision.reason,'APIFY_ATOMIC_RESERVATION_NOT_IMPLEMENTED');
});
test('unknown provider cost always blocks execution',()=>{
 const decision=evaluateApifyBudget({monthlyBudgetUsd:4,spentUsd:null,pendingReservedUsd:0,estimatedNextRunUsd:0.1,providerBalanceUsd:5,credentialsVerified:true,actorConfigured:true});
 assert.equal(decision.reason,'APIFY_COST_OR_BALANCE_UNAVAILABLE');
});
