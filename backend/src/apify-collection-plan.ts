import {evaluateApifyBudget,type ApifyBudgetInput} from './apify-budget-guard.js';

/** Four primary collectors plus two optional hashtag collectors; all execution remains budget-guarded. */
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
}):{ready:false;reason:string;scheduled:ApifyCollectorKind[]}{
 const scheduled:ApifyCollectorKind[]=[];
 const seen=new Set<string>();
 for(const setting of input.settings){
  if(seen.has(setting.kind))return{ready:false,reason:'APIFY_DUPLICATE_COLLECTOR',scheduled:[]};
  seen.add(setting.kind);
  if(setting.enabled){
   if(!/^[\w-]+\/[\w-]+$/.test(setting.actorId))return{ready:false,reason:'APIFY_ACTOR_NOT_CONFIGURED',scheduled:[]};
   scheduled.push(setting.kind);
  }
 }
 if(!scheduled.length)return{ready:false,reason:'APIFY_NO_COLLECTORS_ENABLED',scheduled:[]};
 const decision=evaluateApifyBudget(input.budget);
 return{ready:false,reason:decision.reason,scheduled};
}
