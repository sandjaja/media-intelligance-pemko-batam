import assert from 'node:assert/strict';
import test from 'node:test';
import {previewGeographicActorInput} from './apify-geographic-input.js';
const plan={organizationId:1,city:'Batam',queries:['Batam','Sekupang Batam','Batu Aji Batam'],excludedAmbiguousTerms:[]};
test('TikTok dry run uses Batam-scoped terms and never authorizes a paid run',()=>{
 const result=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:2});
 assert.deepEqual(result.searchTerms,['Batam','Sekupang Batam']);
 assert.equal(result.readyForPaidRun,false);
 assert.equal(result.schemaVerified,false);
 assert.equal(result.proposedInput.searchSection,'/video');
 assert.equal(result.proposedInput.resultsPerPage,5);
});
test('Instagram input proposal remains explicitly unverified',()=>{
 const result=previewGeographicActorInput({actorId:'apify/instagram-scraper',plan});
 assert.equal(result.readyForPaidRun,false);
 assert.equal(result.proposedInput.search,'Batam');
 assert.equal(result.proposedInput.searchType,'place');
 assert.ok(result.blockers.includes('APIFY_ACTOR_INPUT_RUNTIME_NOT_VERIFIED'));
});
test('rejects unknown Actor and excessive query count',()=>{
 assert.throws(()=>previewGeographicActorInput({actorId:'unknown/actor',plan}),/APIFY_GEOGRAPHIC_ACTOR_NOT_SUPPORTED/);
 assert.throws(()=>previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:100}),/APIFY_SEARCH_LIMIT_INVALID/);
});

test('rejects geographic terms outside active organization city',()=>{
 const invalid={...plan,queries:['Batam','Jakarta','Sekupang Batam']};
 assert.throws(()=>previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan:invalid}),/APIFY_GEOGRAPHIC_QUERY_OUT_OF_SCOPE/);
});

test('accepts city token in multiword scoped search query',()=>{
 const result=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:3});
 assert.deepEqual(result.searchTerms,['Batam','Sekupang Batam','Batu Aji Batam']);
});

test('video budgets are bounded in proposals and never approve paid execution',()=>{
 for(const maxVideos of [10,20,50]){
  const t=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:3,maxVideos});
  assert.equal(t.proposedInput.resultsPerPage,Math.floor(maxVideos/3));
  assert.equal(t.readyForPaidRun,false);
  const i=previewGeographicActorInput({actorId:'apify/instagram-scraper',plan,maxVideos});
  assert.equal(i.proposedInput.resultsLimit,maxVideos);
  assert.equal(i.readyForPaidRun,false);
 }
 assert.throws(()=>previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxVideos:100}),/APIFY_VIDEO_LIMIT_INVALID/);
});

test('TikTok proposed per-query results never intentionally exceed selected total',()=>{
 for(const maxVideos of [10,20,50]){
  const result=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:3,maxVideos});
  assert.ok((result.proposedInput.resultsPerPage as number)*result.searchTerms.length<=maxVideos);
 }
});

test('more geographic queries than video budget are trimmed before Actor proposal',()=>{
 const expanded={...plan,queries:Array.from({length:20},(_,i)=>'Wilayah '+i+' Batam')};
 const result=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan:expanded,maxQueries:20,maxVideos:10});
 assert.equal(result.searchTerms.length,10);
 assert.equal(result.proposedInput.resultsPerPage,1);
 assert.ok((result.proposedInput.resultsPerPage as number)*result.searchTerms.length<=10);
});
