/**
 * Apify collector safety boundary. No Actor is executed by this module.
 * A future executor must call evaluateApifyBudget immediately before each run
 * and persist an atomic reservation before making a billable API request.
 */
export type ApifyBudgetInput={
  monthlyBudgetUsd:number;
  spentUsd:number|null;
  pendingReservedUsd:number|null;
  estimatedNextRunUsd:number|null;
  providerBalanceUsd:number|null;
  credentialsVerified:boolean;
  actorConfigured:boolean;
};
export type ApifyBudgetDecision={allowed:false;reason:string;remainingUsd:number|null};
const finiteNonNegative=(v:number|null|undefined):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function evaluateApifyBudget(input:ApifyBudgetInput):ApifyBudgetDecision{
  if(!input.credentialsVerified)return{allowed:false,reason:'APIFY_CREDENTIAL_UNVERIFIED',remainingUsd:null};
  if(!input.actorConfigured)return{allowed:false,reason:'APIFY_ACTOR_NOT_CONFIGURED',remainingUsd:null};
  if(!finiteNonNegative(input.monthlyBudgetUsd))return{allowed:false,reason:'APIFY_BUDGET_INVALID',remainingUsd:null};
  if(!finiteNonNegative(input.spentUsd)||!finiteNonNegative(input.pendingReservedUsd)||!finiteNonNegative(input.estimatedNextRunUsd)||!finiteNonNegative(input.providerBalanceUsd))
    return{allowed:false,reason:'APIFY_COST_OR_BALANCE_UNAVAILABLE',remainingUsd:null};
  const remaining=Math.max(0,Math.min(input.monthlyBudgetUsd-input.spentUsd-input.pendingReservedUsd,input.providerBalanceUsd));
  if(input.estimatedNextRunUsd>remaining)return{allowed:false,reason:'APIFY_BUDGET_EXCEEDED',remainingUsd:remaining};
  return{allowed:false,reason:'APIFY_ATOMIC_RESERVATION_NOT_IMPLEMENTED',remainingUsd:remaining};
}
