import type {Pool} from 'pg';
import {previewApifyPlatform} from './apify-shared-preview.js';
import {loadApifyAdminBudget} from './apify-admin-budget.js';

/** Read-only manual preview using the same authorization scope as scheduler. */
export async function previewManualApifyCollection(pool:Pool,input:{
 platform:'tiktok'|'instagram';requestedBy:string;
}):Promise<{ready:false;reason:string;collectors:string[];actorDetails:{kind:string;actorId:string;adminMaxCostUsd:number|null}[];billableRunStarted:false;requiresExplicitConfirmation:true;adminMonthlyBudgetUsd:number|null}>{
 const result=await previewApifyPlatform(pool,{trigger:'manual',platform:input.platform,requestedBy:input.requestedBy});
 // Display-only monthly budget; it is not a verified per-Actor price or authorization.
 const adminMonthlyBudgetUsd=await loadApifyAdminBudget(pool).catch(()=>null);
 const {rows:limitRows}=await pool.query(`SELECT s.settings->'actorMaxCostUsd' AS limits FROM integration_settings s JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true JOIN organizations o ON o.id=s.organization_id AND o.active=true LIMIT 2`).catch(()=>({rows:[]}));
 const limits=limitRows.length===1&&limitRows[0]?.limits&&typeof limitRows[0].limits==='object'&&!Array.isArray(limitRows[0].limits)?limitRows[0].limits as Record<string,unknown>:{};
 const actorDetails=result.collectors.map(c=>({kind:c.kind,actorId:c.actorId,adminMaxCostUsd:typeof limits[c.kind]==='number'&&Number.isFinite(limits[c.kind])&&(limits[c.kind] as number)>0?limits[c.kind] as number:null}));
 return{ready:false,reason:result.configured?'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED':result.reason,
  collectors:result.collectors.map(c=>c.kind),actorDetails,
  billableRunStarted:false,requiresExplicitConfirmation:true,adminMonthlyBudgetUsd};
}
