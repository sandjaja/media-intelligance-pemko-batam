import type {ApifyActorPricingSnapshot} from './apify-actor-pricing-client.js';
import type {ApifyPricingApproval} from './apify-pricing-approval.js';

/** Strict server-side gate for the first TikTok paid-run rollout.
 * Provider's minimalMaxTotalChargeUsd is a minimum, NOT an upper bound.
 * This helper cannot issue pricing approval from metadata alone.
 * It performs no provider calls, reservations, or billable actions.
 */
export function assessTikTokPricingForPaidRun(input:{
 actorId:string;pricing:ApifyActorPricingSnapshot|null;
 requestedChargeCapUsd:number;providerCapSupported:boolean;
}):{verified:boolean;pricingApproval:ApifyPricingApproval|null;blockers:string[]}{
 const blockers:string[]=[];
 if(input.actorId!=='clockworks/tiktok-scraper')blockers.push('APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT');
 if(!input.pricing||input.pricing.pricingModel!=='PAY_PER_EVENT'||!input.pricing.capEligible)
  blockers.push('APIFY_ACTOR_PRICING_UNAVAILABLE_OR_UNSUPPORTED');
 const minimum=input.pricing?.minimalMaxTotalChargeUsd;
 if(minimum===null||minimum===undefined||!Number.isFinite(minimum)||minimum<0)
  blockers.push('APIFY_ACTOR_MINIMUM_CHARGE_UNVERIFIED');
 if(!Number.isFinite(input.requestedChargeCapUsd)||input.requestedChargeCapUsd<=0||
  Math.abs(input.requestedChargeCapUsd*100-Math.round(input.requestedChargeCapUsd*100))>1e-8)
  blockers.push('APIFY_CHARGE_CAP_INVALID');
 else if(typeof minimum==='number'&&input.requestedChargeCapUsd<minimum)
  blockers.push('APIFY_CHARGE_CAP_BELOW_ACTOR_MINIMUM');
 if(!input.providerCapSupported)blockers.push('APIFY_CHARGE_CAP_NOT_VERIFIED');
 // An API minimum plus a supported maxTotalChargeUsd parameter does not
 // establish a conservative all-in cost estimate for this exact run.
 blockers.push('APIFY_ALL_IN_MAXIMUM_COST_NOT_VERIFIED');
 return{verified:false,pricingApproval:null,blockers};
}
