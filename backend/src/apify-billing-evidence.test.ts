import assert from 'node:assert/strict';
import test from 'node:test';
import {parseApifyBillingEvidence} from './apify-billing-evidence.js';
test('undocumented billing fields cannot prove postpaid or cash credits',()=>{
 for(const payload of [null,{}, {data:{billingMode:'POSTPAID',balanceUsd:999}},
  {data:{subscription:{paymentMethod:'card',creditBalanceUsd:999}}}]){
  const result=parseApifyBillingEvidence(payload);
  assert.equal(result.mode,'UNKNOWN');
  assert.equal(result.verified,false);
  assert.equal(result.cashBalanceUsd,null);
 }
});
