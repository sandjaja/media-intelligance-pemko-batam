import type {Pool} from 'pg';
import {authorizePreparedApifyRun} from './apify-authorized-run.js';
import type {ApifyPricingApproval} from './apify-pricing-approval.js';

/** Read-only verification of a committed reservation before preparing a run.
 * No network request, database mutation, or Actor execution.
 * A production executor must additionally claim RESERVED -> RUNNING atomically
 * to prevent concurrent consumers using the same reservation.
 */
export async function prepareRunFromLedger(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'tiktok'|'instagram';
 configuredActorId:string;configuredMaxUsd:number|null;
 collectorEnabled:boolean;pricingApproval:ApifyPricingApproval|null;
}):Promise<{ready:boolean;reason:string;request?:{method:'POST';path:string;query:{maxTotalChargeUsd:number}}}>{
 if(!input.reservationKey||!input.actorId||input.actorId!==input.configuredActorId)
  return{ready:false,reason:'APIFY_LEDGER_INPUT_INVALID'};
 const {rows}=await pool.query(
  'SELECT actor_id,platform,status,reserved_usd FROM apify_usage_ledger WHERE reservation_key=$1 LIMIT 1',
  [input.reservationKey]);
 if(rows.length!==1)return{ready:false,reason:'APIFY_RESERVATION_NOT_FOUND'};
 const row=rows[0];
 if(row.status!=='RESERVED'||row.actor_id!==input.actorId||row.platform!==input.platform)
  return{ready:false,reason:'APIFY_RESERVATION_MISMATCH'};
 const reserved=Number(row.reserved_usd);
 if(!Number.isFinite(reserved)||reserved<=0)return{ready:false,reason:'APIFY_RESERVATION_AMOUNT_INVALID'};
 const request=authorizePreparedApifyRun({
  actorId:input.actorId,configuredActorId:input.configuredActorId,
  configuredMaxUsd:input.configuredMaxUsd,reservedUsd:reserved,
  collectorEnabled:input.collectorEnabled,pricingApproval:input.pricingApproval
 });
 if(!request)return{ready:false,reason:'APIFY_RUN_NOT_AUTHORIZED'};
 return{ready:true,reason:'APIFY_REQUEST_PREPARED_NOT_EXECUTED',request};
}
