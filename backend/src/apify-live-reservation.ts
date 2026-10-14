import type {Pool} from 'pg';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {loadApifyAccountHeadroom} from './apify-account-headroom.js';
import {reserveApifyCost} from './apify-cost-reservation.js';
import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';

/** Combined fail-closed preflight. Account headroom is a usage-limit allowance,
 * not cash balance. Does not execute Actors. The caller must supply a
 * independently verified conservative per-run cost estimate.
 */
export async function reserveApifyWithLiveLimits(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'instagram'|'tiktok';
 estimatedUsd:number|null;credentialsVerified:boolean;actorConfigured:boolean;
 pricingApproval?:ApifyPricingApproval|null;providerChargeCapVerified?:boolean;
},fetcher:typeof fetch=fetch):Promise<{reserved:boolean;reason:string;remainingUsd:number|null}>{
 if(input.estimatedUsd===null||!Number.isFinite(input.estimatedUsd)||input.estimatedUsd<=0)
  return{reserved:false,reason:'APIFY_ESTIMATE_REQUIRED',remainingUsd:null};
 if(!input.credentialsVerified||!input.actorConfigured)
  return{reserved:false,reason:!input.credentialsVerified?'APIFY_CREDENTIAL_UNVERIFIED':'APIFY_ACTOR_NOT_CONFIGURED',remainingUsd:null};
 // Reject unverified paid requests before reading credentials or calling Apify.
 // This flag is only accepted from a trusted server-side verifier, never HTTP input.
 if(input.providerChargeCapVerified!==true)
  return{reserved:false,reason:'APIFY_CHARGE_CAP_NOT_VERIFIED',remainingUsd:null};
 const approved=conservativeApifyRunEstimate(input.actorId,input.pricingApproval??null);
 if(approved===null||Math.abs(approved-input.estimatedUsd)>0.000001)
  return{reserved:false,reason:'APIFY_PRICING_APPROVAL_REQUIRED',remainingUsd:null};
 const configured=await loadApifyAdminCollectorSettings(pool);
 const selected=configured.find(c=>c.actorId===input.actorId);
 if(!selected||!selected.enabled)return{reserved:false,reason:'APIFY_ACTOR_DISABLED_OR_NOT_CONFIGURED',remainingUsd:null};
 // Fail closed on duplicate Actor IDs: an enabled primary collector must not
 // accidentally authorize a different collector sharing the same Actor ID.
 if(configured.filter(c=>c.actorId===input.actorId).length!==1)
  return{reserved:false,reason:'APIFY_ACTOR_ID_AMBIGUOUS',remainingUsd:null};
 const budget=await loadApifyAdminBudget(pool);
 if(budget===null)return{reserved:false,reason:'APIFY_ADMIN_BUDGET_UNAVAILABLE',remainingUsd:null};
 const {rows:settingsRows}=await pool.query(`SELECT s.settings->'actorMaxCostUsd' AS limits FROM integration_settings s JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true JOIN organizations o ON o.id=s.organization_id AND o.active=true LIMIT 2`);
 if(settingsRows.length!==1)return{reserved:false,reason:'APIFY_ACTOR_LIMIT_UNAVAILABLE',remainingUsd:null};
 const limits=settingsRows[0]?.limits;
 const kind=selected.kind;
 const expectedPlatform=kind?.startsWith('tiktok_')?'tiktok':kind?.startsWith('instagram_')?'instagram':null;
 if(!expectedPlatform||expectedPlatform!==input.platform)
  return{reserved:false,reason:'APIFY_ACTOR_PLATFORM_MISMATCH',remainingUsd:null};
 if(selected.kind!==kind)
  return{reserved:false,reason:'APIFY_ACTOR_KIND_MISMATCH',remainingUsd:null};
 const ceiling=kind&&limits&&typeof limits==='object'&&!Array.isArray(limits)?(limits as Record<string,unknown>)[kind]:null;
 if(typeof ceiling!=='number'||!Number.isFinite(ceiling)||ceiling<0.01||ceiling>5)
  return{reserved:false,reason:'APIFY_ACTOR_LIMIT_UNAVAILABLE',remainingUsd:null};
 if(kind==='tiktok_posts'&&ceiling<0.5)return{reserved:false,reason:'APIFY_TIKTOK_POSTS_MINIMUM_COST_LIMIT',remainingUsd:null};
 if(input.estimatedUsd>ceiling)return{reserved:false,reason:'APIFY_ACTOR_LIMIT_EXCEEDED',remainingUsd:null};
 const headroom=await loadApifyAccountHeadroom(pool,fetcher);
 if(headroom===null)return{reserved:false,reason:'APIFY_ACCOUNT_LIMITS_UNAVAILABLE',remainingUsd:null};
 if(headroom<input.estimatedUsd)return{reserved:false,reason:'APIFY_MONTHLY_HEADROOM_INSUFFICIENT',remainingUsd:headroom};
 // Headroom is an account usage allowance, not prepaid cash. Only reserve
 // against it when a trusted server-side caller independently verified that
 // Apify enforces the per-run PAY_PER_EVENT charge cap.
 return reserveApifyCost(pool,{
  reservationKey:input.reservationKey,actorId:input.actorId,platform:input.platform,
  estimatedUsd:approved,monthlyBudgetUsd:budget,providerBalanceUsd:headroom
 });
}
