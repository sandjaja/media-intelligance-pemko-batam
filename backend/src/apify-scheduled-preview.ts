import type {Pool} from 'pg';
import {previewApifyPlatform} from './apify-shared-preview.js';

/** Existing Admin social scheduler remains the only scheduler.
 * Preview only: no billable execution or schedule activation.
 */
export async function previewScheduledApifyCollection(pool:Pool){
 const platforms=await Promise.all((['tiktok','instagram'] as const).map(async platform=>{
  const result=await previewApifyPlatform(pool,{trigger:'scheduled',platform,requestedBy:null});
  return{platform,collectors:result.collectors,configured:result.configured,
   reason:result.configured?'APIFY_SCHEDULED_EXECUTOR_NOT_CONNECTED':result.reason};
 }));
 return{mode:'preview_only' as const,billableRunStarted:false,schedulerEnabledByThisModule:false,platforms};
}
