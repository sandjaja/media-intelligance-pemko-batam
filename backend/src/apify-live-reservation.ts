import type {Pool} from 'pg';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
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
 const budget=await loadApifyAdminBudget(pool);
 if(budget===null)return{reserved:false,reason:'APIFY_ADMIN_BUDGET_UNAVAILABLE',remainingUsd:null};
 const headroom=await loadApifyAccountHeadroom(pool,fetcher);
 if(headroom===null)return{reserved:false,reason:'APIFY_ACCOUNT_LIMITS_UNAVAILABLE',remainingUsd:null};
 return preflightApifyReservation(pool,{
  ...input,adminMonthlyBudgetUsd:budget,providerBalanceUsd:headroom
 });
}
