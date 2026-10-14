import type {Pool} from 'pg';
import {prepareRunFromLedger} from './apify-ledger-run-preparation.js';
import {claimApifyReservation} from './apify-reservation-claim.js';
import {markApifyRunUnknown} from './apify-run-lifecycle.js';
import type {ApifyPricingApproval} from './apify-pricing-approval.js';

/** Claim-only orchestration. This module never sends an HTTP request to Apify.
 * Pricing approval MUST be supplied by trusted server-side verification, never
 * directly from an HTTP client. An external executor requires explicit opt-in.
 */
export async function prepareAndClaimApifyRun(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'tiktok'|'instagram';
 configuredActorId:string;configuredMaxUsd:number|null;
 collectorEnabled:boolean;pricingApproval:ApifyPricingApproval|null;
 claimId:string;
}):Promise<{ready:boolean;reason:string;request?:{method:'POST';path:string;query:{maxTotalChargeUsd:number}}}>{
 const prepared=await prepareRunFromLedger(pool,input);
 if(!prepared.ready||!prepared.request)return{ready:false,reason:prepared.reason};
 const claimed=await claimApifyReservation(pool,{...input,minimumReservedUsd:prepared.request.query.maxTotalChargeUsd});
 if(!claimed.claimed)return{ready:false,reason:claimed.reason};
 // The conditional claim wins exactly once; verify amount against prepared cap.
 // If the ledger was altered between read and claim, fail closed and retain
 // reservation for manual reconciliation instead of risking an unbudgeted run.
 if(claimed.reservedUsd===null||
    !Number.isFinite(claimed.reservedUsd)||
    claimed.reservedUsd<prepared.request.query.maxTotalChargeUsd||
    claimed.reservedUsd>input.configuredMaxUsd!){
  await markApifyRunUnknown(pool,{reservationKey:input.reservationKey,claimId:input.claimId,
   reason:'CLAIMED_RESERVATION_BELOW_APPROVED_CHARGE_CAP'});
  return{ready:false,reason:'APIFY_CLAIM_AMOUNT_MISMATCH'};
 }
 return{ready:true,reason:'APIFY_CLAIMED_REQUEST_NOT_SENT',request:prepared.request};
}
