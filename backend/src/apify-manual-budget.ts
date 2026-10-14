import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';

/** Read-only budget decision for a future manual run.
 * No per-Actor Admin cap is required: the verified provider charge cap and
 * available monthly budgets are the only spending ceilings. This helper does
 * NOT execute Actors or prove the Apify account has cash credits.
 */
export function evaluateApifyManualBudget(input:{
 actorId:string;configuredActorId:string;collectorEnabled:boolean;
 pricingApproval:ApifyPricingApproval|null;providerChargeCapVerified:boolean;
 monthlyHeadroomUsd:number|null;adminMonthlyRemainingUsd:number|null;
 cashBalanceUsd?:number|null;
}):{
 readyForConfirmation:boolean;maximumChargeUsd:number|null;
 blockers:string[];cashBalanceVerified:boolean;
}{
 const blockers:string[]=[];
 const cap=conservativeApifyRunEstimate(input.actorId,input.pricingApproval);
 if(!input.collectorEnabled||input.actorId!==input.configuredActorId)
  blockers.push('APIFY_ACTOR_DISABLED_OR_MISMATCHED');
 if(cap===null)blockers.push('APIFY_PRICING_APPROVAL_REQUIRED');
 if(!input.providerChargeCapVerified)blockers.push('APIFY_CHARGE_CAP_NOT_VERIFIED');
 const enough=(available:number|null)=>cap!==null&&available!==null&&
  Number.isFinite(available)&&available>=cap;
 if(!enough(input.monthlyHeadroomUsd))
  blockers.push('APIFY_MONTHLY_HEADROOM_INSUFFICIENT_OR_UNAVAILABLE');
 if(!enough(input.adminMonthlyRemainingUsd))
  blockers.push('APIFY_ADMIN_MONTHLY_BUDGET_INSUFFICIENT_OR_UNAVAILABLE');
 // Usage headroom is not cash balance. Unknown funds must fail closed for
 // paid execution; a budget quote alone cannot prove prepaid credits.
 const cashBalanceVerified=typeof input.cashBalanceUsd==='number'&&
  Number.isFinite(input.cashBalanceUsd)&&input.cashBalanceUsd>=0;
 if(!cashBalanceVerified)
  blockers.push('APIFY_CASH_BALANCE_UNVERIFIED');
 else if(cap!==null&&input.cashBalanceUsd!<cap)
  blockers.push('APIFY_CASH_BALANCE_INSUFFICIENT');
 return{readyForConfirmation:blockers.length===0,maximumChargeUsd:cap,
  blockers,cashBalanceVerified};
}
