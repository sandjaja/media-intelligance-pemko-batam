import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApifyChargeCap} from './apify-run-charge-cap.js';
const base={actorId:'clockworks/tiktok-scraper',configuredActorId:'clockworks/tiktok-scraper',configuredMaxUsd:0.5,reservedUsd:0.5,pricingVerified:true,collectorEnabled:true};
test('explicit provider-side cap matches authorized reserved amount',()=>{
 assert.deepEqual(buildApifyChargeCap(base),{maxTotalChargeUsd:0.5});
});
test('disabled, unverified, mismatched or unreserved Actor cannot produce a run cap',()=>{
 assert.equal(buildApifyChargeCap({...base,collectorEnabled:false}),null);
 assert.equal(buildApifyChargeCap({...base,pricingVerified:false}),null);
 assert.equal(buildApifyChargeCap({...base,configuredActorId:'other/actor'}),null);
 assert.equal(buildApifyChargeCap({...base,reservedUsd:null}),null);
 assert.equal(buildApifyChargeCap({...base,reservedUsd:0.6}),null);
 assert.equal(buildApifyChargeCap({...base,configuredMaxUsd:0.3}),null);
});
test('comment collector supports configured $0.15 cap',()=>{
 assert.deepEqual(buildApifyChargeCap({...base,actorId:'clockworks/tiktok-comments-scraper',configuredActorId:'clockworks/tiktok-comments-scraper',configuredMaxUsd:0.15,reservedUsd:0.15}),{maxTotalChargeUsd:0.15});
});
