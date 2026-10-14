import type {Pool} from 'pg';

/** Read-only recovery decision for an uncertain Apify run.
 * Never retries the Actor or releases its reserved budget.
 * Provisional claim IDs cannot be used to query a provider run directly.
 */
export async function inspectUnknownApifyRun(pool:Pool,reservationKey:string):Promise<{
 recoverable:boolean;reason:string;providerRunId:string|null;reservedUsd:number|null;
}>{
 if(!reservationKey)return{recoverable:false,reason:'APIFY_RESERVATION_KEY_REQUIRED',providerRunId:null,reservedUsd:null};
 const {rows}=await pool.query(
  `SELECT status,run_id,reserved_usd,actual_usd FROM apify_usage_ledger
    WHERE reservation_key=$1 LIMIT 1`,[reservationKey]);
 if(rows.length!==1)return{recoverable:false,reason:'APIFY_RESERVATION_NOT_FOUND',providerRunId:null,reservedUsd:null};
 const row=rows[0];
 if(row.status!=='UNKNOWN')return{recoverable:false,reason:'APIFY_RUN_NOT_UNKNOWN',providerRunId:null,reservedUsd:null};
 const reservedUsd=Number(row.reserved_usd);
 if(!Number.isFinite(reservedUsd)||reservedUsd<=0)
  return{recoverable:false,reason:'APIFY_RESERVATION_AMOUNT_INVALID',providerRunId:null,reservedUsd:null};
 const runId=String(row.run_id||'');
 if(!runId||runId.startsWith('claim:'))
  return{recoverable:false,reason:'APIFY_PROVIDER_RUN_ID_UNCONFIRMED_MANUAL_REVIEW',providerRunId:null,reservedUsd};
 return{recoverable:true,reason:'APIFY_PROVIDER_RUN_CAN_BE_QUERIED_READ_ONLY',providerRunId:runId,reservedUsd};
}
