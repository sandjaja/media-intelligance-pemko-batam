import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApifyActorPricing,fetchApifyActorPricing} from './apify-actor-pricing-client.js';

test('only pay-per-event is a candidate for charge cap verification',()=>{
 assert.deepEqual(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5}}}),{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,capEligible:true});
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'PRICE_PER_DATASET_ITEM'}}})?.capEligible,false);
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'FLAT_PRICE_PER_MONTH'}}})?.capEligible,false);
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'UNRECOGNIZED'}}}),null);
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'PAY_PER_EVENT'}}})?.minimalMaxTotalChargeUsd,null);
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:-1}}})?.minimalMaxTotalChargeUsd,null);
});
test('invalid actor IDs never reach network',async()=>{
 const result=await fetchApifyActorPricing('../bad','secret',async()=>{throw Error('network must not run')});
 assert.equal(result,null);
});

test('pricing lookup uses canonical tilde Actor path and GET only',async()=>{
 let called=false;
 const result=await fetchApifyActorPricing('clockworks/tiktok-scraper','test-token',async(input,init)=>{
  called=true;
  assert.equal(String(input),'https://api.apify.com/v2/acts/clockworks~tiktok-scraper');
  assert.equal(init?.method,'GET');
  return {ok:true,json:async()=>({data:{currentPricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5}}})} as Response;
 });
 assert.equal(called,true);
 assert.equal(result?.pricingModel,'PAY_PER_EVENT');
});

test('pricing lookup rejects alternate separators and backslashes',async()=>{
 for(const actorId of ['clockworks~tiktok-scraper','clockworks\\tiktok-scraper','clockworks//tiktok-scraper']){
  let called=false;
  const result=await fetchApifyActorPricing(actorId,'secret',async()=>{called=true;throw Error('unexpected request')});
  assert.equal(result,null);
  assert.equal(called,false);
 }
});

test('Actor metadata chooses currently effective pricing, never future pricing',()=>{
 const current=parseApifyActorPricing({data:{pricingInfos:[
  {pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,startedAt:'2024-01-01T00:00:00.000Z'},
  {pricingModel:'FLAT_PRICE_PER_MONTH',startedAt:'2099-01-01T00:00:00.000Z'}
 ]}});
 assert.equal(current?.pricingModel,'PAY_PER_EVENT');
 assert.equal(current?.minimalMaxTotalChargeUsd,0.5);
 assert.equal(parseApifyActorPricing({data:{pricingInfos:[{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,startedAt:'2099-01-01T00:00:00.000Z'}]}}),null);
 assert.equal(parseApifyActorPricing({data:{currentPricingInfo:{pricingModel:'PRICE_PER_DATASET_ITEM'}}})?.capEligible,false);
});

test('future-only pricing history cannot fall back to unverified current price',()=>{
 const snapshot=parseApifyActorPricing({data:{
  pricingInfos:[{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5,startedAt:'2099-01-01T00:00:00.000Z'}],
  currentPricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5}
 }});
 assert.equal(snapshot,null);
});

test('malformed pricing history never falls back to a current pricing record',()=>{
 assert.equal(parseApifyActorPricing({data:{
  pricingInfos:{pricingModel:'PAY_PER_EVENT',startedAt:'2024-01-01T00:00:00.000Z'},
  currentPricingInfo:{pricingModel:'PAY_PER_EVENT',minimalMaxTotalChargeUsd:0.5}
 }}),null);
});
