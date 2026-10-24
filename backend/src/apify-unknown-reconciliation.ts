import type {Pool} from 'pg';
import {inspectUnknownApifyRun} from './apify-unknown-recovery.js';
import {fetchApifyRunStatus} from './apify-provider-run-status.js';
import {reconcileApifyRun} from './apify-cost-reconciliation.js';

/** Reconcile UNKNOWN only after a confirmed provider run id and verified final cost.
 * Never starts Actors, retries requests, or releases unverified reservations.
 */
export async function reconcileUnknownApifyRun(pool:Pool,input:{
 reservationKey:string;token:string;fetchImpl?:typeof fetch;
}):Promise<{updated:boolean;reason:string}>{
 const inspection=await inspectUnknownApifyRun(pool,input.reservationKey);
 if(!inspection.recoverable||!inspection.providerRunId)
  return{updated:false,reason:inspection.reason};
 const provider=await fetchApifyRunStatus({
  providerRunId:inspection.providerRunId,token:input.token,fetchImpl:input.fetchImpl
 });
 if(!provider.verified)return{updated:false,reason:provider.reason};
 if(provider.status!=='SUCCEEDED'&&provider.status!=='FAILED'&&provider.status!=='TIMED-OUT'&&provider.status!=='ABORTED')
  return{updated:false,reason:'APIFY_PROVIDER_RUN_NOT_FINAL'};
 if(provider.actualUsd===null)
  return{updated:false,reason:'APIFY_FINAL_COST_UNVERIFIED'};
 // Provider terminal errors map to FAILED, while preserving the cost actually charged.
 const status=provider.status==='SUCCEEDED'?'SUCCEEDED':'FAILED';
 return reconcileApifyRun(pool,{reservationKey:input.reservationKey,runId:inspection.providerRunId,
  status,actualUsd:provider.actualUsd,
  errorMessage:provider.status==='SUCCEEDED'?undefined:'Provider status: '+provider.status});
}
