import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareApifyRunRequest} from './apify-run-request.js';
const base={actorId:'clockworks/tiktok-scraper',configuredActorId:'clockworks/tiktok-scraper',configuredMaxUsd:0.5,reservedUsd:0.5,pricingVerified:true,collectorEnabled:true};
test('run request carries provider cap and excludes credentials',()=>{
 assert.deepEqual(prepareApifyRunRequest(base),{path:'/v2/acts/clockworks~tiktok-scraper/runs',query:{maxTotalChargeUsd:0.5},method:'POST'});
});
test('no request for disabled or unreserved collectors',()=>{
 assert.equal(prepareApifyRunRequest({...base,collectorEnabled:false}),null);
 assert.equal(prepareApifyRunRequest({...base,reservedUsd:null}),null);
 assert.equal(prepareApifyRunRequest({...base,pricingVerified:false}),null);
 assert.equal(prepareApifyRunRequest({...base,actorId:'bad?actor'}),null);
});

test('admin-configured Actor can be used when exact settings and safety checks match',()=>{
 const configured={...base,actorId:'custom/paid-actor',configuredActorId:'custom/paid-actor'};
 assert.deepEqual(prepareApifyRunRequest(configured),{path:'/v2/acts/custom~paid-actor/runs',query:{maxTotalChargeUsd:0.5},method:'POST'});
 assert.equal(prepareApifyRunRequest({...configured,configuredActorId:'other/actor'}),null);
 assert.equal(prepareApifyRunRequest({...configured,collectorEnabled:false}),null);
});
test('standby Actor needs enabled configuration and verified pricing',()=>{
 const standby={...base,actorId:'clockworks/tiktok-hashtag-scraper',configuredActorId:'clockworks/tiktok-hashtag-scraper'};
 assert.equal(prepareApifyRunRequest({...standby,collectorEnabled:false}),null);
 assert.equal(prepareApifyRunRequest({...standby,pricingVerified:false}),null);
 assert.deepEqual(prepareApifyRunRequest(standby),{path:'/v2/acts/clockworks~tiktok-hashtag-scraper/runs',query:{maxTotalChargeUsd:0.5},method:'POST'});
});
