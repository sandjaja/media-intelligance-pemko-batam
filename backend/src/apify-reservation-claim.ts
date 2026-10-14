import type {Pool} from 'pg';

/** Atomically claim a committed reservation for exactly one executor.
 * Claim does not call Apify. Keep the reservation committed on network errors;
 * recovery must reconcile UNKNOWN status instead of refunding optimistically.
 *
 * Ledger schema requires a run_id for RUNNING. The claim uses a unique
 * provisional run id, which the executor must replace with the provider run id
 * after a confirmed response. Until then, no external run is authorized here.
 */
export async function claimApifyReservation(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'tiktok'|'instagram';
 claimId:string;
}):Promise<{claimed:boolean;reason:string;reservedUsd:number|null}>{
 if(!input.reservationKey||!input.actorId||!input.claimId||
  !['tiktok','instagram'].includes(input.platform)||
  !/^claim:[a-zA-Z0-9_-]{8,120}$/.test(input.claimId))
  return{claimed:false,reason:'APIFY_CLAIM_INVALID',reservedUsd:null};
 const {rows}=await pool.query(
  `UPDATE apify_usage_ledger
   SET status='RUNNING',run_id=$4,updated_at=NOW()
   WHERE reservation_key=$1 AND actor_id=$2 AND platform=$3
     AND status='RESERVED' AND run_id IS NULL
   RETURNING reserved_usd`,
  [input.reservationKey,input.actorId,input.platform,input.claimId]);
 if(rows.length!==1)return{claimed:false,reason:'APIFY_RESERVATION_NOT_CLAIMABLE',reservedUsd:null};
 const reservedUsd=Number(rows[0].reserved_usd);
 if(!Number.isFinite(reservedUsd)||reservedUsd<=0)
  return{claimed:false,reason:'APIFY_CLAIM_AMOUNT_INVALID',reservedUsd:null};
 return{claimed:true,reason:'APIFY_RESERVATION_CLAIMED_NO_ACTOR_STARTED',reservedUsd};
}
