import assert from 'node:assert/strict';
import test from 'node:test';
import {quoteApifyProviderCappedRun} from './apify-provider-capped-quote.js';
const actorId='clockworks/tiktok-scraper';
const base={actorId,configuredActorId:actorId,collectorEnabled:true,
 pricingApproval:{actorId,maximumRunCostUsd:0.5,verifiedAt:new Date().toISOString(),
 source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true},
 providerChargeCapVerified:true,monthlyHeadroomUsd:1,adminMonthlyRemainingUsd:1,
 selectedVideoLimit:20 as const};
test('provider-capped quote can be shown without claiming a cash balance',()=>{
 const result=quoteApifyProviderCappedRun(base);
 assert.equal(result.readyForConfirmation,true);
 assert.equal(result.maximumChargeUsd,0.5);
 assert.equal(result.balanceStatus,'NOT_VERIFIABLE_FROM_LIMITS_API');
});
test('provider cap and monthly budgets are independently mandatory',()=>{
 for(const patch of [{providerChargeCapVerified:false},
  {monthlyHeadroomUsd:null},{adminMonthlyRemainingUsd:0.49},
  {pricingApproval:null}]){
  assert.equal(quoteApifyProviderCappedRun({...base,...patch}).readyForConfirmation,false);
 }
});
test('target count never changes the verified USD cap',()=>{
 for(const selectedVideoLimit of [10,20,50] as const){
  const result=quoteApifyProviderCappedRun({...base,selectedVideoLimit});
  assert.equal(result.maximumChargeUsd,0.5);
 }
});
