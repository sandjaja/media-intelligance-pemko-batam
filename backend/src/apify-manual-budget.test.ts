import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateApifyManualBudget} from './apify-manual-budget.js';
const actorId='clockworks/tiktok-scraper';
const base={actorId,configuredActorId:actorId,collectorEnabled:true,
 pricingApproval:{actorId,maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),
 source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true},
 providerChargeCapVerified:true,monthlyHeadroomUsd:1,adminMonthlyRemainingUsd:1};
test('budget can be evaluated without a manually configured Actor cap',()=>{
 const result=evaluateApifyManualBudget(base);
 assert.equal(result.maximumChargeUsd,0.5);
 assert.equal(result.readyForConfirmation,true);
 assert.equal(result.cashBalanceVerified,false);
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
