import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateApifyManualBudget} from './apify-manual-budget.js';
const actorId='clockworks/tiktok-scraper';
const base={actorId,configuredActorId:actorId,collectorEnabled:true,
 pricingApproval:{actorId,maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),
 source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true},
 providerChargeCapVerified:true,monthlyHeadroomUsd:1,adminMonthlyRemainingUsd:1,billingMode:'PREPAID' as const,billingModeVerified:true,billingEvidenceSource:'APIFY_PROVIDER_VERIFIED' as const};
test('budget can be evaluated without a manually configured Actor cap',()=>{
 const result=evaluateApifyManualBudget(base);
 assert.equal(result.maximumChargeUsd,0.5);
 assert.equal(result.readyForConfirmation,false);
 assert.equal(result.cashBalanceVerified,false);
 assert.ok(result.blockers.includes('APIFY_CASH_BALANCE_UNVERIFIED'));
});
test('monthly provider and Admin budgets are independent mandatory guards',()=>{
 const provider=evaluateApifyManualBudget({...base,monthlyHeadroomUsd:0.49});
 assert.equal(provider.readyForConfirmation,false);
 assert.ok(provider.blockers.includes('APIFY_MONTHLY_HEADROOM_INSUFFICIENT_OR_UNAVAILABLE'));
 const admin=evaluateApifyManualBudget({...base,adminMonthlyRemainingUsd:null});
 assert.equal(admin.readyForConfirmation,false);
 assert.ok(admin.blockers.includes('APIFY_ADMIN_MONTHLY_BUDGET_INSUFFICIENT_OR_UNAVAILABLE'));
});
test('historical estimate never substitutes for verified pricing or charge cap',()=>{
 const result=evaluateApifyManualBudget({...base,pricingApproval:null,providerChargeCapVerified:false});
 assert.equal(result.readyForConfirmation,false);
 assert.equal(result.maximumChargeUsd,null);
 assert.ok(result.blockers.includes('APIFY_PRICING_APPROVAL_REQUIRED'));
 assert.ok(result.blockers.includes('APIFY_CHARGE_CAP_NOT_VERIFIED'));
});
test('known insufficient cash credits block even if monthly headroom is sufficient',()=>{
 const result=evaluateApifyManualBudget({...base,cashBalanceUsd:0.1});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_CASH_BALANCE_INSUFFICIENT'));
});

test('verified cash credits and both monthly budgets are required together',()=>{
 const result=evaluateApifyManualBudget({...base,cashBalanceUsd:0.75});
 assert.equal(result.readyForConfirmation,true);
 assert.equal(result.cashBalanceVerified,true);
 assert.deepEqual(result.blockers,[]);
});

test('verified postpaid billing does not require prepaid cash credits',()=>{
 const result=evaluateApifyManualBudget({...base,billingMode:'POSTPAID',billingModeVerified:true,cashBalanceUsd:null});
 assert.equal(result.readyForConfirmation,true);
 assert.equal(result.cashBalanceVerified,false);
});
test('unknown billing mode cannot be assumed postpaid',()=>{
 const result=evaluateApifyManualBudget({...base,billingMode:'UNKNOWN',cashBalanceUsd:null});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_CASH_BALANCE_UNVERIFIED'));
});

test('unverified postpaid flag cannot bypass cash balance checks',()=>{
 const result=evaluateApifyManualBudget({...base,billingMode:'POSTPAID',billingModeVerified:false,cashBalanceUsd:null});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_BILLING_MODE_UNVERIFIED'));
});

test('unverified prepaid mode cannot authorize paid run even with sufficient cash',()=>{
 const result=evaluateApifyManualBudget({...base,billingModeVerified:false,cashBalanceUsd:10});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_BILLING_MODE_UNVERIFIED'));
});
test('unknown billing mode cannot authorize even with a reported cash balance',()=>{
 const result=evaluateApifyManualBudget({...base,billingMode:'UNKNOWN',cashBalanceUsd:10});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_BILLING_MODE_UNVERIFIED'));
});

test('a caller-supplied verified flag without provider evidence is insufficient',()=>{
 const result=evaluateApifyManualBudget({...base,billingEvidenceSource:'UNVERIFIED',cashBalanceUsd:10});
 assert.equal(result.readyForConfirmation,false);
 assert.ok(result.blockers.includes('APIFY_BILLING_MODE_UNVERIFIED'));
});
