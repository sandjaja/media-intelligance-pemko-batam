import type {Pool} from 'pg';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {loadApifyAccountHeadroom} from './apify-account-headroom.js';
import {preflightApifyReservation} from './apify-reservation-preflight.js';

/** Combined fail-closed preflight. Account headroom is a usage-limit allowance,
 * not cash balance. Does not execute Actors. The caller must supply a
 * independently verified conservative per-run cost estimate.
 */
export async function reserveApifyWithLiveLimits(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'instagram'|'tiktok';
 estimatedUsd:number|null;credentialsVerified:boolean;actorConfigured:boolean;
},fetcher:typeof fetch=fetch):Promise<{reserved:boolean;reason:string;remainingUsd:number|null}>{
 if(input.estimatedUsd===null||!Number.isFinite(input.estimatedUsd)||input.estimatedUsd<=0)
  return{reserved:false,reason:'APIFY_ESTIMATE_REQUIRED',remainingUsd:null};
 if(!input.credentialsVerified||!input.actorConfigured)
  return{reserved:false,reason:!input.credentialsVerified?'APIFY_CREDENTIAL_UNVERIFIED':'APIFY_ACTOR_NOT_CONFIGURED',remainingUsd:null};
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
 return preflightApifyReservation(pool,{
  ...input,adminMonthlyBudgetUsd:budget,providerBalanceUsd:headroom
 });
}
