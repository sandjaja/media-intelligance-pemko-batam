/** Read-only Apify run status inspection. No Actor execution, retry, or ledger writes.
 * The caller must obtain providerRunId from inspectUnknownApifyRun.
 */
export async function fetchApifyRunStatus(input:{
 providerRunId:string;token:string;fetchImpl?:typeof fetch;
}):Promise<{verified:boolean;reason:string;status:string|null;actualUsd:number|null}>{
 if(!/^[a-zA-Z0-9_-]{5,160}$/.test(input.providerRunId)||!input.token)
  return{verified:false,reason:'APIFY_RUN_LOOKUP_INVALID',status:null,actualUsd:null};
 const fetcher=input.fetchImpl??fetch;
 try{
  const response=await fetcher('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(input.providerRunId),{
   method:'GET',headers:{Authorization:'Bearer '+input.token,Accept:'application/json'},
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)return{verified:false,reason:'APIFY_RUN_LOOKUP_HTTP_'+response.status,status:null,actualUsd:null};
  const payload=await response.json() as {data?:{id?:string;status?:string;usageTotalUsd?:unknown}};
  const data=payload?.data;
  if(data?.id!==input.providerRunId||typeof data.status!=='string')
   return{verified:false,reason:'APIFY_RUN_RESPONSE_INVALID',status:null,actualUsd:null};
  const raw=data.usageTotalUsd;
  const actualUsd=typeof raw==='number'&&Number.isFinite(raw)&&raw>=0?raw:null;
  return{verified:true,reason:actualUsd===null?'APIFY_RUN_COST_UNVERIFIED':'APIFY_RUN_STATUS_READ',status:data.status,actualUsd};
 }catch{
  return{verified:false,reason:'APIFY_RUN_LOOKUP_UNAVAILABLE',status:null,actualUsd:null};
 }
}
