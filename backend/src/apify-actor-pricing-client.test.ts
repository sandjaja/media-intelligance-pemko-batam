import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApifyActorPricing,fetchApifyActorPricing} from './apify-actor-pricing-client.js';

test('only pay-per-event is a candidate for charge cap verification',()=>{
 assert.deepEqual(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5}}}),{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,capEligible:true});
 assert.equal(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'PRICE_PER_DATASET_ITEM'}}})?.capEligible,false);
 assert.equal(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'FLAT_PRICE_PER_MONTH'}}})?.capEligible,false);
 assert.equal(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'UNRECOGNIZED'}}}),null);
 assert.equal(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'PAY_PER_EVENT'}}})?.minimalMaxTotalChargeUsd,null);
 assert.equal(parseApifyActorPricing({data:{pricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:-1}}})?.minimalMaxTotalChargeUsd,null);
});
test('invalid actor IDs never reach network',async()=>{
 const result=await fetchApifyActorPricing('../bad','secret',async()=>{throw Error('network must not run')});
 assert.equal(result,null);
});
