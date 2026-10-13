import type {Pool} from 'pg';

/** Persist provider-confirmed cost after an Apify run.
 * Unknown costs stay reserved (fail closed); never assume a failed run was free.
 */
export async function reconcileApifyRun(pool:Pool,input:{
 reservationKey:string;runId:string;
 status:'RUNNING'|'SUCCEEDED'|'FAILED'|'UNKNOWN';
 actualUsd:number|null;
 errorMessage?:string;
}):Promise<{updated:boolean;reason:string}>{
 if(!input.reservationKey||!input.runId||!['RUNNING','SUCCEEDED','FAILED','UNKNOWN'].includes(input.status))
  return{updated:false,reason:'APIFY_RECONCILE_INVALID'};
 if(input.actualUsd!==null&&(!Number.isFinite(input.actualUsd)||input.actualUsd<0))
  return{updated:false,reason:'APIFY_RECONCILE_INVALID_COST'};
 if(['SUCCEEDED','FAILED'].includes(input.status)&&input.actualUsd===null)
  return{updated:false,reason:'APIFY_FINAL_COST_UNVERIFIED'};
 const result=await pool.query(`
  UPDATE apify_usage_ledger
  SET run_id=$2,status=$3,actual_usd=$4,error_message=$5,
      finished_at=CASE WHEN $3 IN ('SUCCEEDED','FAILED') THEN NOW() ELSE NULL END,
      updated_at=NOW()
  WHERE reservation_key=$1
    AND (run_id IS NULL OR run_id=$2)
    AND status IN ('RESERVED','RUNNING','UNKNOWN')
  RETURNING id`,
  [input.reservationKey,input.runId,input.status,input.actualUsd,input.errorMessage??null]);
 return result.rowCount?{updated:true,reason:'APIFY_RECONCILED'}:{updated:false,reason:'APIFY_RESERVATION_NOT_FOUND_OR_FINAL'};
}
