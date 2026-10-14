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
