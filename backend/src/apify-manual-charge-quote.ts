import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';

/** Read-only server-side decision support. Never authorizes or starts an Actor. */
export function buildApifyManualChargeQuote(input:{
 actorId:string;configuredActorId:string;configuredMaxUsd:number|null;
 collectorEnabled:boolean;pricingApproval:ApifyPricingApproval|null;
 providerChargeCapVerified:boolean;monthlyHeadroomUsd:number|null;
}):{
 readyForConfirmation:boolean;maximumChargeUsd:number|null;
 adminLimitUsd:number|null;monthlyHeadroomUsd:number|null;blockers:string[];
}{
 const blockers:string[]=[];
 const estimate=conservativeApifyRunEstimate(input.actorId,input.pricingApproval);
 if(!input.collectorEnabled||input.configuredActorId!==input.actorId)
  blockers.push('APIFY_ACTOR_DISABLED_OR_MISMATCHED');
 if(input.actorId!=='clockworks/tiktok-scraper')
  blockers.push('APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT');
 if(estimate===null)blockers.push('APIFY_PRICING_APPROVAL_REQUIRED');
 if(input.providerChargeCapVerified!==true)blockers.push('APIFY_CHARGE_CAP_NOT_VERIFIED');
 const limit=input.configuredMaxUsd;
 if(limit===null||!Number.isFinite(limit)||limit<=0||estimate!==null&&estimate>limit)
  blockers.push('APIFY_ACTOR_LIMIT_EXCEEDED_OR_UNAVAILABLE');
 const headroom=input.monthlyHeadroomUsd;
 if(headroom===null||!Number.isFinite(headroom)||headroom<0||estimate!==null&&estimate>headroom)
  blockers.push('APIFY_MONTHLY_HEADROOM_INSUFFICIENT_OR_UNAVAILABLE');
 return{readyForConfirmation:blockers.length===0,maximumChargeUsd:estimate,
  adminLimitUsd:limit,monthlyHeadroomUsd:headroom,blockers};
}
