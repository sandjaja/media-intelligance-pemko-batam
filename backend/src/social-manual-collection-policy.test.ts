import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveManualSocialCollectionPolicy} from './social-manual-collection-policy.js';

test('all-platform manual action runs YouTube but never authorizes billable Apify',()=>{
 const policy=resolveManualSocialCollectionPolicy('semua');
 assert.equal(policy.runYouTube,true);
 assert.deepEqual(policy.previewApifyPlatforms,['tiktok','instagram']);
 assert.equal(policy.apifyExecutionMode,'PREVIEW_ONLY');
 assert.equal(policy.paidApifyAuthorized,false);
});
test('YouTube remains independent from Apify previews',()=>{
 const policy=resolveManualSocialCollectionPolicy('youtube');
 assert.equal(policy.runYouTube,true);
 assert.deepEqual(policy.previewApifyPlatforms,[]);
 assert.equal(policy.paidApifyAuthorized,false);
});
test('TikTok and Instagram manual selection only previews, never starts YouTube or paid Actors',()=>{
 for(const platform of ['tiktok','instagram'] as const){
  const policy=resolveManualSocialCollectionPolicy(platform);
  assert.equal(policy.runYouTube,false);
  assert.deepEqual(policy.previewApifyPlatforms,[platform]);
  assert.equal(policy.apifyExecutionMode,'PREVIEW_ONLY');
  assert.equal(policy.paidApifyAuthorized,false);
 }
});
