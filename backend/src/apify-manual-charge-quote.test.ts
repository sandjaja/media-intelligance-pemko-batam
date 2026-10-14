import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApifyManualChargeQuote} from './apify-manual-charge-quote.js';
const actorId='clockworks/tiktok-scraper';
const base={actorId,configuredActorId:actorId,configuredMaxUsd:0.5,
 collectorEnabled:true,pricingApproval:{actorId,maximumRunCostUsd:0.5,
 verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,
 includesAllEventsAndOverheads:true},
 providerChargeCapVerified:true,monthlyHeadroomUsd:1};
test('read-only quote reports maximum charge without executing provider',()=>{
 const quote=buildApifyManualChargeQuote(base);
 assert.equal(quote.readyForConfirmation,true);
 assert.equal(quote.maximumChargeUsd,0.5);
 assert.deepEqual(quote.blockers,[]);
});
test('quote fails closed when provider cap is unverified',()=>{
 const quote=buildApifyManualChargeQuote({...base,providerChargeCapVerified:false});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_CHARGE_CAP_NOT_VERIFIED'));
});
test('quote fails closed for insufficient monthly headroom',()=>{
 const quote=buildApifyManualChargeQuote({...base,monthlyHeadroomUsd:0.49});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_MONTHLY_HEADROOM_INSUFFICIENT_OR_UNAVAILABLE'));
});

test('Admin cap and available headroom cannot substitute for a verified maximum quote',()=>{
 const quote=buildApifyManualChargeQuote({...base,pricingApproval:null});
 assert.equal(quote.readyForConfirmation,false);
 assert.equal(quote.maximumChargeUsd,null);
 assert.ok(quote.blockers.includes('APIFY_PRICING_APPROVAL_REQUIRED'));
});
test('different Actor approval cannot authorize TikTok Posts',()=>{
 const quote=buildApifyManualChargeQuote({...base,pricingApproval:{...base.pricingApproval,actorId:'clockworks/tiktok-comments-scraper'}});
 assert.equal(quote.readyForConfirmation,false);
 assert.equal(quote.maximumChargeUsd,null);
});
test('Instagram Actor remains outside initial paid rollout even with otherwise valid inputs',()=>{
 const other='apify/instagram-scraper';
 const quote=buildApifyManualChargeQuote({...base,actorId:other,configuredActorId:other,
  pricingApproval:{...base.pricingApproval,actorId:other}});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT'));
});

test('rejects verified quote exceeding remaining Admin monthly budget',()=>{
 const quote=buildApifyManualChargeQuote({...base,adminMonthlyRemainingUsd:0.49});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_ADMIN_MONTHLY_BUDGET_INSUFFICIENT_OR_UNAVAILABLE'));
});
test('missing remaining Admin monthly budget fails closed when provided',()=>{
 const quote=buildApifyManualChargeQuote({...base,adminMonthlyRemainingUsd:null});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_ADMIN_MONTHLY_BUDGET_INSUFFICIENT_OR_UNAVAILABLE'));
});
test('sufficient verified Admin monthly remaining budget alone cannot approve a run',()=>{
 const quote=buildApifyManualChargeQuote({...base,adminMonthlyRemainingUsd:3,providerChargeCapVerified:false});
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_CHARGE_CAP_NOT_VERIFIED'));
});

test('preview numbers do not authorize payment without independent price approval',()=>{
 const quote=buildApifyManualChargeQuote({...base,pricingApproval:null,
  providerChargeCapVerified:false,monthlyHeadroomUsd:4.59,adminMonthlyRemainingUsd:4});
 assert.equal(quote.readyForConfirmation,false);
 assert.equal(quote.maximumChargeUsd,null);
 assert.ok(quote.blockers.includes('APIFY_PRICING_APPROVAL_REQUIRED'));
 assert.ok(quote.blockers.includes('APIFY_CHARGE_CAP_NOT_VERIFIED'));
});
