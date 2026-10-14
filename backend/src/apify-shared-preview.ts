import type {Pool} from 'pg';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {validateApifyCollectionCommand,type ApifyCollectionCommand} from './apify-collection-command.js';

const expectedActors:Record<string,string>={
 tiktok_posts:'clockworks/tiktok-scraper',
 instagram_posts:'apify/instagram-scraper',
 tiktok_comments:'clockworks/tiktok-comments-scraper',
 instagram_comments:'apidojo/instagram-comments-scraper-api',
 tiktok_hashtag:'clockworks/tiktok-hashtag-scraper',
 instagram_hashtag:'apify/instagram-hashtag-scraper'
};

/** Shared fail-closed configuration gate for manual and scheduled Apify.
 * Does not reserve funds, call Actors or enable the schedule.
 */
export async function previewApifyPlatform(pool:Pool,input:{
 trigger:'manual'|'scheduled';platform:'tiktok'|'instagram';requestedBy:string|null;
}):Promise<{configured:boolean;reason:string;collectors:{kind:string;actorId:string}[]}>{
 const configured=await loadApifyAdminCollectorSettings(pool);
 if(!configured.length)return{configured:false,reason:'APIFY_ADMIN_COLLECTORS_UNAVAILABLE',collectors:[]};
 const selected=configured.filter(c=>c.enabled&&c.kind.startsWith(input.platform+'_'));
 const collectors=selected.map(c=>({kind:c.kind,actorId:c.actorId}));
 const command:ApifyCollectionCommand={...input,collectorKinds:collectors.map(c=>c.kind)};
 const decision=validateApifyCollectionCommand(command);
 if(!decision.valid)return{configured:false,reason:decision.reason,collectors};
 if(selected.some(c=>!c.actorId||c.actorId!==expectedActors[c.kind]))
  return{configured:false,reason:'APIFY_ACTOR_NOT_CONFIGURED_OR_MISMATCHED',collectors};
 return{configured:true,reason:'APIFY_EXECUTOR_NOT_CONNECTED',collectors};
}
