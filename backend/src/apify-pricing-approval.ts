/** Pricing must be verified for the exact Actor and run configuration.
 * Public "from" prices are NOT upper bounds. No Actor is executed here.
 */
export type ApifyPricingApproval={
 actorId:string;maximumRunCostUsd:number;verifiedAt:string;
 source:'actor-pricing-confirmed';includesAllEventsAndOverheads:boolean;
};
const approvedActors=new Set([
 'clockworks/tiktok-scraper','apify/instagram-scraper',
 'clockworks/tiktok-comments-scraper','apidojo/instagram-comments-scraper-api',
 // Standby only: inclusion here does not permit scheduling or execution.
 'clockworks/tiktok-hashtag-scraper','apify/instagram-hashtag-scraper'
]);
export function conservativeApifyRunEstimate(actorId:string,approval:ApifyPricingApproval|null):number|null{
 if(!approvedActors.has(actorId)||!approval||approval.actorId!==actorId||
  approval.source!=='actor-pricing-confirmed'||!approval.includesAllEventsAndOverheads)return null;
 const date=new Date(approval.verifiedAt);
 if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()||Date.now()-date.getTime()>86400000)return null;
 const amount=approval.maximumRunCostUsd;
 return Number.isFinite(amount)&&amount>0?amount:null;
}
