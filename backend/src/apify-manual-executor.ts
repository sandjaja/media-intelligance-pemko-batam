import type {Pool} from 'pg';
import {prepareAndClaimApifyRun} from './apify-claim-orchestrator.js';
import {confirmApifyProviderRun,markApifyRunUnknown} from './apify-run-lifecycle.js';
import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';
import {previewGeographicActorInput} from './apify-geographic-input.js';
import type {GeographicSearchPlan} from './apify-geographic-search.js';

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
 actorInput:Record<string,unknown>;trustedGeographicPlan?:GeographicSearchPlan;selectedVideoLimit?:10|20|50;
 providerChargeCapVerified?:boolean;fetcher?:typeof fetch;
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
 if(!input.pricingApproval||input.pricingApproval.actorId!==input.actorId||!input.pricingApproval.includesAllEventsAndOverheads)return{started:false,reason:'APIFY_PRICING_APPROVAL_REQUIRED'};
 const approvedMaximum=conservativeApifyRunEstimate(input.actorId,input.pricingApproval);
 if(approvedMaximum===null)return{started:false,reason:'APIFY_PRICING_APPROVAL_EXPIRED_OR_INVALID'};
 if(input.configuredMaxUsd===null||!Number.isFinite(input.configuredMaxUsd)||input.configuredMaxUsd<=0||
    approvedMaximum>input.configuredMaxUsd)
  return{started:false,reason:'APIFY_APPROVED_COST_EXCEEDS_ADMIN_LIMIT'};
 if(!input.collectorEnabled)return{started:false,reason:'APIFY_COLLECTOR_DISABLED'};
 // Never trust an arbitrary claim identifier: it is used for ledger ownership.
 if(!/^claim:[a-zA-Z0-9_-]{8,120}$/.test(input.claimId))
  return{started:false,reason:'APIFY_CLAIM_ID_INVALID'};
 if(!input.token.trim())return{started:false,reason:'APIFY_TOKEN_REQUIRED'};
 if(!input.actorInput||Array.isArray(input.actorInput)||typeof input.actorInput!=='object')
  return{started:false,reason:'APIFY_ACTOR_INPUT_INVALID'};
 // Only bounded, Batam-scoped discovery inputs may reach the paid TikTok Actor.
 // The aggregate requested ceiling is at most 50; the provider may still
 // return more, and the downstream dataset importer must enforce its own cap.
 // The verified runtime schema and trusted geographic plan must be supplied
 // by the eventual server route; arbitrary hashtags or empty searches fail closed.
 const terms=input.actorInput.searchQueries;
 if(!Array.isArray(terms)||terms.length<1||terms.length>5||
    terms.some(term=>typeof term!=='string'||term.length<3||term.length>100||!/(?:^|\s)batam(?:$|\s)/i.test(term))||
    input.actorInput.searchSection!=='/video'||
    !Number.isSafeInteger(input.actorInput.resultsPerPage)||
    (input.actorInput.resultsPerPage as number)<1||
    (input.actorInput.resultsPerPage as number)>50||
    (input.actorInput.resultsPerPage as number)*terms.length>50||
    input.actorInput.commentsPerPost!==0||
    input.actorInput.shouldDownloadVideos!==false)
  return{started:false,reason:'APIFY_TIKTOK_GEOGRAPHIC_INPUT_NOT_VERIFIED'};
 // Server-origin geographic plan must match the exact proposed paid input.
 // Caller must load this plan from the tenant database, never from request JSON.
 if(!input.trustedGeographicPlan||!input.selectedVideoLimit)
  return{started:false,reason:'APIFY_TRUSTED_GEOGRAPHIC_PLAN_REQUIRED'};
 let proposed:Record<string,unknown>;
 try{
  proposed=previewGeographicActorInput({actorId:input.actorId,
   plan:input.trustedGeographicPlan,maxQueries:5,maxVideos:input.selectedVideoLimit}).proposedInput;
 }catch{
  return{started:false,reason:'APIFY_TRUSTED_GEOGRAPHIC_PLAN_INVALID'};
 }
 const canonical=(value:unknown):string=>JSON.stringify(value);
 if(canonical(proposed)!==canonical(input.actorInput))
  return{started:false,reason:'APIFY_TIKTOK_INPUT_PLAN_MISMATCH'};
 const claimed=await prepareAndClaimApifyRun(pool,input);
 if(!claimed.ready||!claimed.request)return{started:false,reason:claimed.reason};
 const {request}=claimed;
 // A claimed reservation must never authorize a larger provider charge than the
 // freshly approved estimate or the Admin limit. Fail closed without POST.
 if(!Number.isFinite(request.query.maxTotalChargeUsd)||request.query.maxTotalChargeUsd<=0||
    request.query.maxTotalChargeUsd>approvedMaximum||request.query.maxTotalChargeUsd>input.configuredMaxUsd){
  await markApifyRunUnknown(pool,{reservationKey:input.reservationKey,claimId:input.claimId,
   reason:'APIFY_CLAIMED_CAP_EXCEEDS_APPROVAL'});
  return{started:false,reason:'APIFY_CLAIMED_CAP_EXCEEDS_APPROVAL'};
 }
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
  // The provider might have accepted the POST even if its response failed.
  // A database outage during quarantine must not hide that uncertainty.
  try{
   await markApifyRunUnknown(pool,{reservationKey:input.reservationKey,claimId:input.claimId,
    reason:'APIFY_START_RESPONSE_UNCERTAIN'});
  }catch{
   return{started:false,reason:'APIFY_START_UNKNOWN_LEDGER_UNAVAILABLE'};
  }
  return{started:false,reason:'APIFY_START_UNKNOWN_RECONCILIATION_REQUIRED'};
 }
 // Provider already returned a run id. A ledger error must not propagate as
 // a generic retryable failure that could trigger a second paid Actor run.
 let confirmed:{confirmed:boolean;reason:string};
 try{
  confirmed=await confirmApifyProviderRun(pool,{
   reservationKey:input.reservationKey,claimId:input.claimId,providerRunId
  });
 }catch{
  return{started:false,reason:'APIFY_PROVIDER_STARTED_LEDGER_CONFIRMATION_FAILED',providerRunId};
 }
 if(!confirmed.confirmed)
  return{started:false,reason:'APIFY_PROVIDER_STARTED_LEDGER_CONFIRMATION_FAILED',providerRunId};
 return{started:true,reason:'APIFY_PROVIDER_RUN_STARTED',providerRunId};
}
