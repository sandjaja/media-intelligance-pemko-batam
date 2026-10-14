/** Read-only historical cost inspection. Never starts an Actor or authorizes spend. */
export type ApifyCostSample={runId:string;status:string;costUsd:number|null;finishedAt:string|null;itemCount:number|null};
export async function fetchApifyActorCostHistory(input:{token:string;actorId:string;limit?:number;fetcher?:typeof fetch}):Promise<{samples:ApifyCostSample[];averageCostUsd:number|null;costKnownCount:number;partial:boolean;costPerItemUsd:number|null;costPerItemSampleCount:number;estimatedCostsUsd:{'10':number;'20':number;'50':number}|null}>{
 const {token,actorId}=input;
 if(!token?.trim()||!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(actorId))throw Error('APIFY_COST_HISTORY_INVALID_INPUT');
 const limit=Math.min(20,Math.max(1,Math.trunc(input.limit??10)));
 const fetcher=input.fetcher??fetch;
 const url='https://api.apify.com/v2/acts/'+encodeURIComponent(actorId)+'/runs?limit='+limit+'&desc=1';
 const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('APIFY_COST_HISTORY_PROVIDER_UNAVAILABLE');
 const body=await response.json() as {data?:{items?:unknown[]}};
 if(!Array.isArray(body?.data?.items))throw Error('APIFY_COST_HISTORY_INVALID_RESPONSE');
 const samples:ApifyCostSample[]=body.data.items.slice(0,limit).map((item:unknown)=>{
  const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;
  const cost=typeof row.usageTotalUsd==='number'&&Number.isFinite(row.usageTotalUsd)&&row.usageTotalUsd>=0?row.usageTotalUsd:null;
  return{runId:typeof row.id==='string'?row.id:'',status:typeof row.status==='string'?row.status:'UNKNOWN',costUsd:cost,finishedAt:typeof row.finishedAt==='string'?row.finishedAt:null,itemCount:typeof row.stats==='object'&&row.stats!==null&&typeof (row.stats as Record<string,unknown>).outputItems==='number'&&Number.isSafeInteger((row.stats as Record<string,unknown>).outputItems)&&((row.stats as Record<string,unknown>).outputItems as number)>=0?(row.stats as Record<string,unknown>).outputItems as number:null};
 });
 const complete=samples.filter(s=>['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(s.status)&&s.finishedAt!==null&&s.costUsd!==null);
 const averageCostUsd=complete.length?complete.reduce((sum,s)=>sum+s.costUsd!,0)/complete.length:null;
 const withItems=complete.filter(s=>s.status==='SUCCEEDED'&&s.itemCount!==null&&s.itemCount>0);
 const totalItems=withItems.reduce((sum,s)=>sum+s.itemCount!,0);
 const costPerItemUsd=totalItems>0?withItems.reduce((sum,s)=>sum+s.costUsd!,0)/totalItems:null;
 const estimatedCostsUsd=withItems.length>=3&&costPerItemUsd!==null?{'10':costPerItemUsd*10,'20':costPerItemUsd*20,'50':costPerItemUsd*50}:null;
 return{samples,averageCostUsd,costKnownCount:complete.length,partial:samples.some(s=>s.costUsd===null),costPerItemUsd,costPerItemSampleCount:withItems.length,estimatedCostsUsd};
}
