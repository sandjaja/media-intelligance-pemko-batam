import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeApifyTikTokPosts} from './apify-tiktok-post-normalizer.js';

test('normalizes one valid TikTok video into an ingestion candidate',()=>{
 const result=normalizeApifyTikTokPosts([{id:'7345678901234567890',text:'Berita Batam',webVideoUrl:'https://www.tiktok.com/@batam/video/7345678901234567890?lang=id',author:{uniqueId:'batam'},createTime:1700000000}]);
 assert.equal(result.rejected,0);
 assert.equal(result.candidates.length,1);
 assert.equal(result.candidates[0].platform,'tiktok');
 assert.equal(result.candidates[0].externalId,'7345678901234567890');
 assert.equal(result.candidates[0].canonicalUrl,'https://www.tiktok.com/@batam/video/7345678901234567890');
});
test('rejects malformed or non-TikTok provider items without writing anything',()=>{
 const result=normalizeApifyTikTokPosts([null,{}, {id:'7345678901234567890',text:'Berita Batam',webVideoUrl:'https://evil.example/@batam/video/7345678901234567890'}]);
 assert.equal(result.candidates.length,0);
 assert.equal(result.rejected,3);
});
