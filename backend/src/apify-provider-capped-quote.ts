import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';

/** Read-only proposal based on a provider-enforced per-run cap.
 * Does not infer or claim any prepaid cash balance, billing mode, or final
 * number of collected videos. No Actor is started here.
 */
export function quoteApifyProviderCappedRun(input:{
 actorId:string;configuredActorId:string;collectorEnabled:boolean;
 pricingApproval:ApifyPricingApproval|null;providerChargeCapVerified:boolean;
 monthlyHeadroomUsd:number|null;adminMonthlyRemainingUsd:number|null;
 selectedVideoLimit:10|20|50;
}):{
 readyForConfirmation:boolean;maximumChargeUsd:number|null;
 selectedVideoLimit:10|20|50;blockers:string[];
 balanceStatus:'NOT_VERIFIABLE_FROM_LIMITS_API';
}{
 const blockers:string[]=[];
 const cap=conservativeApifyRunEstimate(input.actorId,input.pricingApproval);
 if(input.actorId!=='clockworks/tiktok-scraper')
  blockers.push('APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT');
 if(!input.collectorEnabled||input.configuredActorId!==input.actorId)
  blockers.push('APIFY_ACTOR_DISABLED_OR_MISMATCHED');
 if(cap===null)blockers.push('APIFY_PRICING_APPROVAL_REQUIRED');
 if(input.providerChargeCapVerified!==true)
  blockers.push('APIFY_CHARGE_CAP_NOT_VERIFIED');
 if(![10,20,50].includes(input.selectedVideoLimit))
  blockers.push('APIFY_VIDEO_TARGET_INVALID');
 for(const [available,code] of [
  [input.monthlyHeadroomUsd,'APIFY_MONTHLY_HEADROOM_INSUFFICIENT_OR_UNAVAILABLE'],
  [input.adminMonthlyRemainingUsd,'APIFY_ADMIN_MONTHLY_BUDGET_INSUFFICIENT_OR_UNAVAILABLE']
 ] as const){
  if(cap===null||available===null||!Number.isFinite(available)||available<cap)
   blockers.push(code);
 }
 return{readyForConfirmation:blockers.length===0,maximumChargeUsd:cap,
  selectedVideoLimit:input.selectedVideoLimit,blockers,
  balanceStatus:'NOT_VERIFIABLE_FROM_LIMITS_API'};
}
