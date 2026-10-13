/** Both manual Social Media fetch and daily scheduler must pass the same
 * Apify authorization boundary. No network or billable operations here.
 */
export type ApifyCollectionTrigger='manual'|'scheduled';
export type ApifyCollectionCommand={
 trigger:ApifyCollectionTrigger;
 platform:'tiktok'|'instagram';
 requestedBy:string|null;
 collectorKinds:readonly string[];
};
export function validateApifyCollectionCommand(command:ApifyCollectionCommand):{valid:boolean;reason:string}{
 if(!['manual','scheduled'].includes(command.trigger))return{valid:false,reason:'APIFY_TRIGGER_INVALID'};
 if(!['tiktok','instagram'].includes(command.platform))return{valid:false,reason:'APIFY_PLATFORM_INVALID'};
 if(command.trigger==='manual'&&(!command.requestedBy||!command.requestedBy.trim()))
  return{valid:false,reason:'APIFY_MANUAL_ACTOR_REQUIRED'};
 if(command.trigger==='scheduled'&&command.requestedBy!==null)
  return{valid:false,reason:'APIFY_SCHEDULED_ACTOR_INVALID'};
 const allowed=command.platform==='tiktok'
  ?new Set(['tiktok_posts','tiktok_comments','tiktok_hashtag'])
  :new Set(['instagram_posts','instagram_comments','instagram_hashtag']);
 if(!command.collectorKinds.length||new Set(command.collectorKinds).size!==command.collectorKinds.length||
  command.collectorKinds.some(kind=>!allowed.has(kind)))
  return{valid:false,reason:'APIFY_COLLECTOR_SCOPE_INVALID'};
 return{valid:true,reason:'APIFY_COMMAND_VALID'};
}
