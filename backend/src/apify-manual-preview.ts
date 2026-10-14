import type {Pool} from 'pg';
import {previewApifyPlatform} from './apify-shared-preview.js';
import {loadApifyAdminBudget} from './apify-admin-budget.js';

/** Read-only manual preview using the same authorization scope as scheduler. */
export async function previewManualApifyCollection(pool:Pool,input:{
 platform:'tiktok'|'instagram';requestedBy:string;
}):Promise<{ready:false;reason:string;collectors:string[];actorDetails:{kind:string;actorId:string}[];billableRunStarted:false;requiresExplicitConfirmation:true;adminMonthlyBudgetUsd:number|null}>{
 const result=await previewApifyPlatform(pool,{trigger:'manual',platform:input.platform,requestedBy:input.requestedBy});
 // Display-only monthly budget; it is not a verified per-Actor price or authorization.
 const adminMonthlyBudgetUsd=await loadApifyAdminBudget(pool).catch(()=>null);
 return{ready:false,reason:result.configured?'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED':result.reason,
  collectors:result.collectors.map(c=>c.kind),actorDetails:result.collectors,
  billableRunStarted:false,requiresExplicitConfirmation:true,adminMonthlyBudgetUsd};
}
