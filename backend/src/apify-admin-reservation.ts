import type {Pool} from 'pg';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
import {preflightApifyReservation} from './apify-reservation-preflight.js';

/** Read the latest persisted Admin budget immediately before reservation.
 * This module does not invoke Apify or schedule collectors.
 */
export async function reserveApifyWithAdminBudget(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'instagram'|'tiktok';
 estimatedUsd:number|null;providerBalanceUsd:number|null;
 credentialsVerified:boolean;actorConfigured:boolean;
}):Promise<{reserved:boolean;reason:string;remainingUsd:number|null}>{
 const budget=await loadApifyAdminBudget(pool);
 return preflightApifyReservation(pool,{
  ...input,adminMonthlyBudgetUsd:budget
 });
}
