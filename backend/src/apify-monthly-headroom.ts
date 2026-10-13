/** Read Apify's documented account monthly usage headroom.
 * This is NOT prepaid balance and must never be presented as credits.
 * Does not make network calls or authorize Actor execution.
 */
export function parseApifyMonthlyHeadroom(payload:unknown):number|null{
 if(!payload||typeof payload!=='object')return null;
 const data=(payload as Record<string,unknown>).data;
 if(!data||typeof data!=='object')return null;
 const obj=data as Record<string,unknown>;
 const limits=obj.limits,current=obj.current;
 if(!limits||typeof limits!=='object'||!current||typeof current!=='object')return null;
 const max=(limits as Record<string,unknown>).maxMonthlyUsageUsd;
 const used=(current as Record<string,unknown>).monthlyUsageUsd;
 if(typeof max!=='number'||typeof used!=='number'||!Number.isFinite(max)||!Number.isFinite(used)||max<0||used<0)return null;
 return Math.max(0,max-used);
}
