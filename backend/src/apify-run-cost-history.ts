/** Read-only historical cost inspection. Never starts an Actor or authorizes spend. */
export type ApifyCostSample={runId:string;status:string;costUsd:number|null;finishedAt:string|null;itemCount:number|null};
export async function fetchApifyActorCostHistory(input:{token:string;actorId:string;limit?:number;fetcher?:typeof fetch}):Promise<{samples:ApifyCostSample[];averageCostUsd:number|null;costKnownCount:number;partial:boolean;costPerItemUsd:number|null;costPerItemSampleCount:number;estimatedCostsUsd:{'10':number;'20':number;'50':number}|null}>{
 const {token,actorId}=input;
 if(!token?.trim()||!['clockworks/tiktok-scraper','apify/instagram-scraper'].includes(actorId))throw Error('APIFY_COST_HISTORY_INVALID_INPUT');
 const limit=Math.min(20,Math.max(1,Math.trunc(input.limit??10)));
 const fetcher=input.fetcher??fetch;
 const {resolveApifyActorInternalId}=await import('./apify-actor-identity.js');
 const internalActorId=await resolveApifyActorInternalId({actorId:actorId as 'clockworks/tiktok-scraper'|'apify/instagram-scraper',token,fetcher});
 const url='https://api.apify.com/v2/acts/'+actorId.replace('/','~')+'/runs?limit='+limit+'&desc=1';
 const response=await fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('APIFY_COST_HISTORY_PROVIDER_UNAVAILABLE');
 const body=await response.json() as {data?:{items?:unknown[]}};
 if(!Array.isArray(body?.data?.items))throw Error('APIFY_COST_HISTORY_INVALID_RESPONSE');
 const samples:ApifyCostSample[]=body.data.items.slice(0,limit).map((item:unknown)=>{
  const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;
  if(row.actId!==internalActorId)return{runId:'',status:'ACTOR_MISMATCH',costUsd:null,finishedAt:null,itemCount:null};
  const cost=typeof row.usageTotalUsd==='number'&&Number.isFinite(row.usageTotalUsd)&&row.usageTotalUsd>=0?row.usageTotalUsd:null;
  return{runId:typeof row.id==='string'?row.id:'',status:typeof row.status==='string'?row.status:'UNKNOWN',costUsd:cost,finishedAt:typeof row.finishedAt==='string'?row.finishedAt:null,itemCount:typeof row.stats==='object'&&row.stats!==null&&typeof (row.stats as Record<string,unknown>).outputItems==='number'&&Number.isSafeInteger((row.stats as Record<string,unknown>).outputItems)&&((row.stats as Record<string,unknown>).outputItems as number)>=0?(row.stats as Record<string,unknown>).outputItems as number:null};
 });
 // Actor run lists may omit detailed cost/output stats. Read completed run details
 // for a bounded sample before calculating any per-item estimate.
 const candidates=samples.filter(s=>s.runId&&s.finishedAt&&(s.costUsd===null||s.itemCount===null)).slice(0,10);
 await Promise.all(candidates.map(async sample=>{
  try{
   const detail=await fetcher('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(sample.runId),{
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!detail.ok)return;
   const payload=await detail.json() as {data?:Record<string,unknown>};
   const run=payload?.data;
   if(!run||run.id!==sample.runId||run.actId!==internalActorId||run.status!==sample.status)return;
   if(typeof run.usageTotalUsd==='number'&&Number.isFinite(run.usageTotalUsd)&&run.usageTotalUsd>=0)sample.costUsd=run.usageTotalUsd;
   const stats=run.stats as Record<string,unknown>|undefined;
   if(stats&&typeof stats.outputItems==='number'&&Number.isSafeInteger(stats.outputItems)&&stats.outputItems>=0)sample.itemCount=stats.outputItems;
   // Some Actor runs report their output only in the default dataset metadata.
   // Read metadata (not dataset items); this is bounded and read-only.
   if(sample.itemCount===null&&typeof run.defaultDatasetId==='string'&&/^[a-zA-Z0-9_-]{5,160}$/.test(run.defaultDatasetId)){
    const datasetResponse=await fetcher('https://api.apify.com/v2/datasets/'+encodeURIComponent(run.defaultDatasetId),{
     headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(datasetResponse.ok){
     const datasetPayload=await datasetResponse.json() as {data?:{itemCount?:unknown}};
     const count=datasetPayload?.data?.itemCount;
     if(typeof count==='number'&&Number.isSafeInteger(count)&&count>=0)sample.itemCount=count;
    }
   }
  }catch{/* Incomplete provider history must not fabricate cost. */}
 }));
 const complete=samples.filter(s=>s.runId&&['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(s.status)&&s.finishedAt!==null&&s.costUsd!==null);
 const averageCostUsd=complete.length?complete.reduce((sum,s)=>sum+s.costUsd!,0)/complete.length:null;
 const withItems=complete.filter(s=>s.status==='SUCCEEDED'&&s.itemCount!==null&&s.itemCount>0);
 const totalItems=withItems.reduce((sum,s)=>sum+s.itemCount!,0);
 // An output count is not necessarily the number of billable events. This
 // historical ratio is display-only and must never authorize a paid run.
 const costPerItemUsd=totalItems>0?withItems.reduce((sum,s)=>sum+s.costUsd!,0)/totalItems:null;
 const estimatedCostsUsd=withItems.length>=3&&costPerItemUsd!==null?{'10':costPerItemUsd*10,'20':costPerItemUsd*20,'50':costPerItemUsd*50}:null;
 return{samples,averageCostUsd,costKnownCount:complete.length,partial:samples.some(s=>s.status==='ACTOR_MISMATCH'||(s.runId&&s.finishedAt&&(s.costUsd===null||s.itemCount===null))),costPerItemUsd,costPerItemSampleCount:withItems.length,estimatedCostsUsd};
}
