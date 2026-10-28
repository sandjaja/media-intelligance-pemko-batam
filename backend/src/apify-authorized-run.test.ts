import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizePreparedApifyRun} from './apify-authorized-run.js';
const base={actorId:'clockworks/tiktok-scraper',configuredActorId:'clockworks/tiktok-scraper',configuredMaxUsd:0.5,reservedUsd:0.5,collectorEnabled:true,pricingApproval:{actorId:'clockworks/tiktok-scraper',maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true}};
test('fresh matching pricing and full reservation yield capped request',()=>{
 assert.deepEqual(authorizePreparedApifyRun(base),{method:'POST',path:'/v2/acts/clockworks~tiktok-scraper/runs',query:{maxTotalChargeUsd:0.5}});
});
test('no pricing, stale pricing or partial reservation fails closed',()=>{
 assert.equal(authorizePreparedApifyRun({...base,pricingApproval:null}),null);
 assert.equal(authorizePreparedApifyRun({...base,reservedUsd:0.49}),null);
 assert.equal(authorizePreparedApifyRun({...base,configuredMaxUsd:0.49}),null);
 assert.equal(authorizePreparedApifyRun({...base,collectorEnabled:false}),null);
 assert.equal(authorizePreparedApifyRun({...base,pricingApproval:{...base.pricingApproval,verifiedAt:'2020-01-01T00:00:00.000Z'}}),null);
 assert.equal(authorizePreparedApifyRun({...base,pricingApproval:{...base.pricingApproval,includesAllEventsAndOverheads:false}}),null);
});

test('larger reservation than approved maximum is rejected',()=>{
 const request=authorizePreparedApifyRun({...base,reservedUsd:0.5,pricingApproval:{...base.pricingApproval,maximumRunCostUsd:0.3}});
 assert.equal(request,null);
});
