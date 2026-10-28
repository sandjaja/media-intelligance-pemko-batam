import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateApifyBudget} from './apify-budget-guard.js';
test('dynamic admin budget over four dollars is valid but still fails closed without reservation',()=>{
 const result=evaluateApifyBudget({monthlyBudgetUsd:10,spentUsd:2,pendingReservedUsd:1,estimatedNextRunUsd:0.5,providerBalanceUsd:8,credentialsVerified:true,actorConfigured:true});
 assert.equal(result.reason,'APIFY_ATOMIC_RESERVATION_NOT_IMPLEMENTED');
 assert.equal(result.remainingUsd,7);
});
test('budget reduction immediately blocks new estimated runs',()=>{
 const result=evaluateApifyBudget({monthlyBudgetUsd:4,spentUsd:3.8,pendingReservedUsd:0.2,estimatedNextRunUsd:0.1,providerBalanceUsd:10,credentialsVerified:true,actorConfigured:true});
 assert.equal(result.reason,'APIFY_BUDGET_EXCEEDED');
});
