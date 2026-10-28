import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeHashtag,normalizeHashtagResults,validateHashtagCollector,APIFY_HASHTAG_COLLECTOR_KINDS} from './apify-hashtag-collector.js';
test('registers Instagram and TikTok hashtag collectors',()=>{
 assert.deepEqual([...APIFY_HASHTAG_COLLECTOR_KINDS],['instagram_hashtag','tiktok_hashtag']);
});
test('normalizes hashtag and removes duplicates',()=>{
 const result=validateHashtagCollector({platform:'instagram',actorId:'apify/instagram-hashtag-scraper',hashtags:['#Batam','batam'],maxItemsPerTag:10});
 assert.deepEqual(result.hashtags,['batam']);
 assert.equal(normalizeHashtag(' #PemkoBatam '),'pemkobatam');
});
test('rejects missing actor and unsafe collection limits',()=>{
 assert.throws(()=>validateHashtagCollector({platform:'tiktok',actorId:'',hashtags:['batam'],maxItemsPerTag:10}),/ACTOR_NOT_CONFIGURED/);
 assert.throws(()=>validateHashtagCollector({platform:'tiktok',actorId:'clockworks/tiktok-scraper',hashtags:['batam'],maxItemsPerTag:100}),/INVALID_APIFY_HASHTAG_LIMIT/);
});
test('tags normalized hashtag discoveries',()=>{
 const result=normalizeHashtagResults('tiktok','#Batam',[{id:'v1',text:'Kabar Batam',webVideoUrl:'https://www.tiktok.com/@a/video/1'}]);
 assert.equal(result.length,1);
 assert.equal((result[0].metadata as Record<string,unknown>).discoveryHashtag,'batam');
});
