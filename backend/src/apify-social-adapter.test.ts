import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeApifyPost,normalizeApifyPosts,normalizeApifyComment,normalizeApifyComments} from './apify-social-adapter.js';
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

test('TikTok comment maps with parent URL and deduplicates',()=>{
 const parent='https://www.tiktok.com/@batam/video/123';
 const item={id:'c123',text:'Komentar warga',user:{username:'warga'}};
 const result=normalizeApifyComment('tiktok',item,parent);
 assert.equal(result?.externalId,'comment:c123');
 assert.equal(result?.contentType,'comment');
 assert.equal((result?.metadata as {parentUrl:string}).parentUrl,parent);
 assert.equal(normalizeApifyComments('tiktok',[item,item],parent).length,1);
});
test('Instagram comments without a parent or id are rejected',()=>{
 assert.equal(normalizeApifyComment('instagram',{id:'1',text:'Komentar'}),null);
 assert.equal(normalizeApifyComment('instagram',{text:'Komentar'},'https://www.instagram.com/p/x/'),null);
});
