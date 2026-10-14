import type {Pool} from 'pg';
import {prepareAndClaimApifyRun} from './apify-claim-orchestrator.js';
import {confirmApifyProviderRun,markApifyRunUnknown} from './apify-run-lifecycle.js';
import type {ApifyPricingApproval} from './apify-pricing-approval.js';

/** Execute one explicitly approved, previously RESERVED Apify run.
 * This is an opt-in executor primitive, NOT a route or scheduler. The caller
 * must obtain verified pricing and an explicit user confirmation server-side.
 * Never retry an uncertain POST: UNKNOWN reservations require reconciliation.
 */
export async function executeClaimedApifyRun(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'tiktok'|'instagram';
 configuredActorId:string;configuredMaxUsd:number|null;
 collectorEnabled:boolean;pricingApproval:ApifyPricingApproval|null;
 claimId:string;token:string;explicitlyConfirmed:boolean;
 actorInput:Record<string,unknown>;providerChargeCapVerified?:boolean;fetcher?:typeof fetch;
}):Promise<{started:boolean;reason:string;providerRunId?:string}>{
 if(!input.explicitlyConfirmed)return{started:false,reason:'APIFY_USER_CONFIRMATION_REQUIRED'};
 // The request parameter alone is not proof that this Actor's pricing model
 // enforces the configured USD cap. Require trusted server-side verification.
 if(input.providerChargeCapVerified!==true)
  return{started:false,reason:'APIFY_CHARGE_CAP_NOT_VERIFIED'};
 // Initial rollout is TikTok Posts only; Instagram and other collectors stay preview-only.
 if(input.platform!=='tiktok'||input.actorId!=='clockworks/tiktok-scraper'||
    input.configuredActorId!==input.actorId)
  return{started:false,reason:'APIFY_MANUAL_COLLECTOR_NOT_ENABLED_FOR_ROLLOUT'};
 if(!input.token.trim())return{started:false,reason:'APIFY_TOKEN_REQUIRED'};
 if(!input.actorInput||Array.isArray(input.actorInput)||typeof input.actorInput!=='object')
  return{started:false,reason:'APIFY_ACTOR_INPUT_INVALID'};
 const claimed=await prepareAndClaimApifyRun(pool,input);
 if(!claimed.ready||!claimed.request)return{started:false,reason:claimed.reason};
 const {request}=claimed;
 const url=new URL('https://api.apify.com'+request.path);
 url.searchParams.set('maxTotalChargeUsd',String(request.query.maxTotalChargeUsd));
 let providerRunId:string|null=null;
 try{
  const response=await (input.fetcher??fetch)(url,{
   method:'POST',
   headers:{Authorization:'Bearer '+input.token,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify(input.actorInput),
   signal:AbortSignal.timeout(20000)
  });
  // A non-2xx response does not prove that Apify never started the run.
  if(!response.ok)throw new Error('APIFY_START_HTTP_'+response.status);
  const payload=await response.json() as {data?:{id?:unknown}};
  if(typeof payload?.data?.id!=='string'||!/^[a-zA-Z0-9_-]{5,160}$/.test(payload.data.id))
   throw new Error('APIFY_START_RUN_ID_UNVERIFIED');
  providerRunId=payload.data.id;
 }catch{
  await markApifyRunUnknown(pool,{reservationKey:input.reservationKey,claimId:input.claimId,
   reason:'APIFY_START_RESPONSE_UNCERTAIN'});
  return{started:false,reason:'APIFY_START_UNKNOWN_RECONCILIATION_REQUIRED'};
 }
 const confirmed=await confirmApifyProviderRun(pool,{
  reservationKey:input.reservationKey,claimId:input.claimId,providerRunId
 });
 if(!confirmed.confirmed)
  return{started:false,reason:'APIFY_PROVIDER_STARTED_LEDGER_CONFIRMATION_FAILED',providerRunId};
 return{started:true,reason:'APIFY_PROVIDER_RUN_STARTED',providerRunId};
}
