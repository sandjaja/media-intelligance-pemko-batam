import assert from 'node:assert/strict';
import test from 'node:test';
import {assessTikTokPricingForPaidRun} from './apify-tiktok-pricing-gate.js';
const base={actorId:'clockworks/tiktok-scraper',
 pricing:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,capEligible:true},
 requestedChargeCapUsd:0.5,providerCapSupported:true};
test('provider price floor and cap support never mint an all-in pricing approval',()=>{
 const result=assessTikTokPricingForPaidRun(base);
 assert.equal(result.verified,false);
 assert.equal(result.pricingApproval,null);
 assert.ok(result.blockers.includes('APIFY_ALL_IN_MAXIMUM_COST_NOT_VERIFIED'));
});
test('proposed cap below actor minimum is rejected',()=>{
 const result=assessTikTokPricingForPaidRun({...base,requestedChargeCapUsd:0.49});
 assert.ok(result.blockers.includes('APIFY_CHARGE_CAP_BELOW_ACTOR_MINIMUM'));
});
test('unknown or incompatible pricing cannot pass the gate',()=>{
 for(const pricing of [null,{pricingModel:'FREE',minimalMaxTotalChargeUsd:null,capEligible:false}]){
  const result=assessTikTokPricingForPaidRun({...base,pricing});
  assert.equal(result.verified,false);
  assert.ok(result.blockers.includes('APIFY_ACTOR_PRICING_UNAVAILABLE_OR_UNSUPPORTED'));
 }
});
