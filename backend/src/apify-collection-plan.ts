import {evaluateApifyBudget,type ApifyBudgetInput} from './apify-budget-guard.js';

/** Four production candidates; hashtag collectors are intentionally excluded. */
export const APIFY_PRIMARY_COLLECTORS=[
 'tiktok_posts','instagram_posts','tiktok_comments','instagram_comments'
] as const;
export const APIFY_STANDBY_COLLECTORS=[
 'tiktok_hashtag','instagram_hashtag'
] as const;
export type ApifyCollectorKind=typeof APIFY_PRIMARY_COLLECTORS[number]|typeof APIFY_STANDBY_COLLECTORS[number];
export type ApifyCollectorSetting={kind:ApifyCollectorKind;actorId:string;enabled:boolean};
export function planApifyCollection(input:{
 settings:ApifyCollectorSetting[];
 budget:ApifyBudgetInput;
}):{ready:false;reason:string;scheduled:typeof APIFY_PRIMARY_COLLECTORS[number][]}{
 const scheduled:typeof APIFY_PRIMARY_COLLECTORS[number][]=[];
 const seen=new Set<string>();
 for(const setting of input.settings){
  if(seen.has(setting.kind))return{ready:false,reason:'APIFY_DUPLICATE_COLLECTOR',scheduled:[]};
  seen.add(setting.kind);
  if(setting.enabled&&(APIFY_STANDBY_COLLECTORS as readonly string[]).includes(setting.kind))
   return{ready:false,reason:'APIFY_STANDBY_REQUIRES_EXPLICIT_ACTIVATION',scheduled:[]};
  if(setting.enabled&&(APIFY_PRIMARY_COLLECTORS as readonly string[]).includes(setting.kind)){
   if(!/^[\w-]+\/[\w-]+$/.test(setting.actorId))return{ready:false,reason:'APIFY_ACTOR_NOT_CONFIGURED',scheduled:[]};
   scheduled.push(setting.kind as typeof APIFY_PRIMARY_COLLECTORS[number]);
  }
 }
 if(!scheduled.length)return{ready:false,reason:'APIFY_NO_PRIMARY_COLLECTORS_ENABLED',scheduled:[]};
 const decision=evaluateApifyBudget(input.budget);
 return{ready:false,reason:decision.reason,scheduled};
}
