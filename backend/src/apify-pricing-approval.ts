/** Pricing must be verified for the exact Actor and run configuration.
 * Public "from" prices are NOT upper bounds. No Actor is executed here.
 */
export type ApifyPricingApproval={
 actorId:string;maximumRunCostUsd:number;verifiedAt:string;
 source:'actor-pricing-confirmed';includesAllEventsAndOverheads:boolean;
};
export function conservativeApifyRunEstimate(actorId:string,approval:ApifyPricingApproval|null):number|null{
 if(!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(actorId)||!approval||approval.actorId!==actorId||
  approval.source!=='actor-pricing-confirmed'||!approval.includesAllEventsAndOverheads)return null;
 const date=new Date(approval.verifiedAt);
 if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()||Date.now()-date.getTime()>86400000)return null;
 const amount=approval.maximumRunCostUsd;
 // USD charge caps use cent precision; rejecting fractional cents prevents
 // an approved estimate from silently rounding down at provider submission.
 return Number.isFinite(amount)&&amount>=0.01&&Number.isInteger(Math.round(amount*100))&&Math.abs(amount*100-Math.round(amount*100))<1e-8?amount:null;
}
