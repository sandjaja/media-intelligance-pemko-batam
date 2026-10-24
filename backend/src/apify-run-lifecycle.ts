import type {Pool} from 'pg';

/** Attach confirmed provider run id to an atomically claimed reservation.
 * No Actor execution. Do not clear reservation when a provider request times out.
 */
export async function confirmApifyProviderRun(pool:Pool,input:{
 reservationKey:string;claimId:string;providerRunId:string;
}):Promise<{confirmed:boolean;reason:string}>{
 if(!input.reservationKey||!/^claim:[a-zA-Z0-9_-]{8,120}$/.test(input.claimId)||
  !/^[a-zA-Z0-9_-]{5,160}$/.test(input.providerRunId)||
  input.providerRunId===input.claimId)
  return{confirmed:false,reason:'APIFY_RUN_ID_INVALID'};
 const {rows}=await pool.query(
  `UPDATE apify_usage_ledger SET run_id=$3,updated_at=NOW()
   WHERE reservation_key=$1 AND run_id=$2 AND status='RUNNING'
   RETURNING id`,
  [input.reservationKey,input.claimId,input.providerRunId]);
 return rows.length===1
  ?{confirmed:true,reason:'APIFY_PROVIDER_RUN_RECORDED'}
  :{confirmed:false,reason:'APIFY_CLAIM_NOT_FOUND'};
}

/** Network timeout / uncertain provider response: retain reserved cost.
 * UNKNOWN status is intentionally not considered a refund or a safe retry.
 */
export async function markApifyRunUnknown(pool:Pool,input:{
 reservationKey:string;claimId:string;reason:string;
}):Promise<{marked:boolean;reason:string}>{
 if(!input.reservationKey||!/^claim:[a-zA-Z0-9_-]{8,120}$/.test(input.claimId))
  return{marked:false,reason:'APIFY_CLAIM_INVALID'};
 const safeReason=(input.reason||'Provider response unknown').slice(0,500);
 const {rows}=await pool.query(
  `UPDATE apify_usage_ledger SET status='UNKNOWN',error_message=$3,updated_at=NOW()
   WHERE reservation_key=$1 AND run_id=$2 AND status='RUNNING'
   RETURNING id`,
  [input.reservationKey,input.claimId,safeReason]);
 return rows.length===1
  ?{marked:true,reason:'APIFY_UNKNOWN_REQUIRES_RECONCILIATION'}
  :{marked:false,reason:'APIFY_CLAIM_NOT_FOUND'};
}
