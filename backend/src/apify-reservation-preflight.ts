import type {Pool} from 'pg';
import {reserveApifyCost} from './apify-cost-reservation.js';

/** Fail-closed bridge from Admin configuration to the atomic ledger.
 * Callers must obtain the current budget from persisted Admin settings and
 * a fresh provider balance. No Actor is started by this function.
 */
export async function preflightApifyReservation(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'instagram'|'tiktok';
 estimatedUsd:number|null;adminMonthlyBudgetUsd:number|null;
 providerBalanceUsd:number|null;credentialsVerified:boolean;
 actorConfigured:boolean;
}):Promise<{reserved:boolean;reason:string;remainingUsd:number|null}>{
 const blocked=(reason:string)=>({reserved:false as const,reason,remainingUsd:null});
 if(!input.credentialsVerified)return blocked('APIFY_CREDENTIAL_UNVERIFIED');
 if(!input.actorConfigured)return blocked('APIFY_ACTOR_NOT_CONFIGURED');
 if(input.adminMonthlyBudgetUsd===null||!Number.isFinite(input.adminMonthlyBudgetUsd)||input.adminMonthlyBudgetUsd<0)
  return blocked('APIFY_ADMIN_BUDGET_UNAVAILABLE');
 if(input.providerBalanceUsd===null||!Number.isFinite(input.providerBalanceUsd)||input.providerBalanceUsd<0)
  return blocked('APIFY_PROVIDER_BALANCE_UNAVAILABLE');
 if(input.estimatedUsd===null||!Number.isFinite(input.estimatedUsd)||input.estimatedUsd<=0)
  return blocked('APIFY_ESTIMATE_REQUIRED');
 if(input.providerBalanceUsd<input.estimatedUsd)
  return blocked('APIFY_PROVIDER_BALANCE_INSUFFICIENT');
 return reserveApifyCost(pool,{
  reservationKey:input.reservationKey,actorId:input.actorId,platform:input.platform,
  estimatedUsd:input.estimatedUsd,monthlyBudgetUsd:input.adminMonthlyBudgetUsd,
  providerBalanceUsd:input.providerBalanceUsd
 });
}
