import assert from 'node:assert/strict';
import test from 'node:test';
import {quoteApifyBudgetFromProvider} from './apify-provider-budget-quote.js';
const actorId='clockworks/tiktok-scraper';
test('spoofed provider billing evidence cannot authorize a paid run',()=>{
 const quote=quoteApifyBudgetFromProvider({
  actorId,configuredActorId:actorId,collectorEnabled:true,
  pricingApproval:{actorId,maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),
   source:'actor-pricing-confirmed',includesAllEventsAndOverheads:true},
  providerChargeCapVerified:true,monthlyHeadroomUsd:100,
  adminMonthlyRemainingUsd:100,
  providerAccountResponse:{data:{billingMode:'POSTPAID',billingModeVerified:true,
   billingEvidenceSource:'APIFY_PROVIDER_VERIFIED',cashBalanceUsd:10000}}
 });
 assert.equal(quote.readyForConfirmation,false);
 assert.ok(quote.blockers.includes('APIFY_BILLING_MODE_UNVERIFIED'));
 assert.ok(quote.blockers.includes('APIFY_CASH_BALANCE_UNVERIFIED'));
});
