/** Read-only historical cost inspection. Never starts an Actor or authorizes spend. */
export type ApifyCostSample={runId:string;status:string;costUsd:number|null;finishedAt:string|null};
export async function fetchApifyActorCostHistory(input:{token:string;actorId:string;limit?:number;fetcher?:typeof fetch}):Promise<{samples:ApifyCostSample[];averageCostUsd:number|null;costKnownCount:number;partial:boolean}>{
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
  return{runId:typeof row.id==='string'?row.id:'',status:typeof row.status==='string'?row.status:'UNKNOWN',costUsd:cost,finishedAt:typeof row.finishedAt==='string'?row.finishedAt:null};
 });
 const complete=samples.filter(s=>['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(s.status)&&s.finishedAt!==null&&s.costUsd!==null);
 const averageCostUsd=complete.length?complete.reduce((sum,s)=>sum+s.costUsd!,0)/complete.length:null;
 return{samples,averageCostUsd,costKnownCount:complete.length,partial:samples.some(s=>s.costUsd===null)};
}
