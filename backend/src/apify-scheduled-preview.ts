import type {Pool} from 'pg';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {validateApifyCollectionCommand} from './apify-collection-command.js';

/** Shared scheduled Apify configuration preview. Intentionally no Actor runs,
 * reservations, network calls, or changes to existing YouTube collection.
 * Admin's existing social scheduler checkbox controls whether this is inspected.
 */
export async function previewScheduledApifyCollection(pool:Pool){
 const settings=await loadApifyAdminCollectorSettings(pool);
 const platforms=(['tiktok','instagram'] as const).map(platform=>{
  const collectors=settings.filter(x=>x.kind.startsWith(platform+'_')&&x.enabled&&x.actorId)
   .map(x=>({kind:x.kind,actorId:x.actorId}));
  const validation=collectors.length?validateApifyCollectionCommand({
   trigger:'scheduled',platform,requestedBy:null,collectorKinds:collectors.map(x=>x.kind)
  }):{valid:false,reason:'APIFY_NO_ENABLED_COLLECTORS'};
  return {platform,collectors,configured:validation.valid,reason:validation.valid?'APIFY_SCHEDULED_EXECUTOR_NOT_CONNECTED':validation.reason};
 });
 return {mode:'preview_only' as const,billableRunStarted:false,schedulerEnabledByThisModule:false,platforms};
}
