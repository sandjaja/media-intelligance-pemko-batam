import assert from 'node:assert/strict';
import test from 'node:test';
import {previewGeographicActorInput} from './apify-geographic-input.js';
const plan={organizationId:1,city:'Batam',queries:['Batam','Sekupang Batam','Batu Aji Batam'],excludedAmbiguousTerms:[]};
test('TikTok dry run uses Batam-scoped terms and never authorizes a paid run',()=>{
 const result=previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:2});
 assert.deepEqual(result.searchTerms,['Batam','Sekupang Batam']);
 assert.equal(result.readyForPaidRun,false);
 assert.equal(result.schemaVerified,false);
});
test('Instagram input proposal remains explicitly unverified',()=>{
 const result=previewGeographicActorInput({actorId:'apify/instagram-scraper',plan});
 assert.equal(result.readyForPaidRun,false);
 assert.ok(result.blockers.includes('APIFY_ACTOR_INPUT_SCHEMA_NOT_VERIFIED'));
});
test('rejects unknown Actor and excessive query count',()=>{
 assert.throws(()=>previewGeographicActorInput({actorId:'unknown/actor',plan}),/APIFY_GEOGRAPHIC_ACTOR_NOT_SUPPORTED/);
 assert.throws(()=>previewGeographicActorInput({actorId:'clockworks/tiktok-scraper',plan,maxQueries:100}),/APIFY_SEARCH_LIMIT_INVALID/);
});
