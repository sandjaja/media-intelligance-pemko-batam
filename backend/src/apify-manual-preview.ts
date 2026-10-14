import {validateApifyCollectionCommand,type ApifyCollectionCommand} from './apify-collection-command.js';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import type {Pool} from 'pg';

/** Read-only manual collection preview. Does not reserve funds or run Actors.
 * A later executor must reuse the same reservation and provider-side charge cap
 * for manual and scheduled collection.
 */
export async function previewManualApifyCollection(pool:Pool,input:{
 platform:'tiktok'|'instagram';requestedBy:string;
}):Promise<{ready:false;reason:string;collectors:string[]}>{
 const configured=await loadApifyAdminCollectorSettings(pool);
 if(!configured.length)return{ready:false,reason:'APIFY_ADMIN_COLLECTORS_UNAVAILABLE',collectors:[]};
 const selected=configured.filter(c=>c.enabled&&c.kind.startsWith(input.platform+'_'));
 const command:ApifyCollectionCommand={trigger:'manual',platform:input.platform,requestedBy:input.requestedBy,collectorKinds:selected.map(c=>c.kind)};
 const decision=validateApifyCollectionCommand(command);
 if(!decision.valid)return{ready:false,reason:decision.reason,collectors:[]};
 if(selected.some(c=>!c.actorId||!/^[\w-]+\/[\w.-]+$/.test(c.actorId)))
  return{ready:false,reason:'APIFY_ACTOR_NOT_CONFIGURED',collectors:[]};
 return{ready:false,reason:'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED',collectors:selected.map(c=>c.kind)};
}
