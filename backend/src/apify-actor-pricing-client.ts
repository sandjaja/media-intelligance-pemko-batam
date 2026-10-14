/** Read-only Apify Actor metadata. Never starts a run or authorizes spending. */
export type ApifyActorPricingSnapshot={pricingModel:string;minimalMaxTotalChargeUsd:number|null;capEligible:boolean};
export function parseApifyActorPricing(payload:unknown):ApifyActorPricingSnapshot|null{
 if(!payload||typeof payload!=='object')return null;
 const data=(payload as Record<string,unknown>).data;
 if(!data||typeof data!=='object'||Array.isArray(data))return null;
 const pricing=(data as Record<string,unknown>).pricingInfo;
 if(!pricing||typeof pricing!=='object'||Array.isArray(pricing))return null;
 const info=pricing as Record<string,unknown>;
 const model=info.pricingModel;
 if(typeof model!=='string'||!['PAY_PER_EVENT','PRICE_PER_DATASET_ITEM','FLAT_PRICE_PER_MONTH','FREE'].includes(model))return null;
 const minimum=info.minimalMaxTotalChargeUsd;
 const min=typeof minimum==='number'&&Number.isFinite(minimum)&&minimum>=0?minimum:null;
 // Eligibility is conservative: only PAY_PER_EVENT is considered a candidate,
 // and even this does not prove a total bill cap including platform overhead.
 return{pricingModel:model,minimalMaxTotalChargeUsd:min,capEligible:model==='PAY_PER_EVENT'};
}
export async function fetchApifyActorPricing(actorId:string,apiKey:string,fetcher:typeof fetch=fetch):Promise<ApifyActorPricingSnapshot|null>{
 if(!/^[a-zA-Z0-9_-]+[\\/~][a-zA-Z0-9_.-]+$/.test(actorId)||!apiKey.trim())return null;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher('https://api.apify.com/v2/acts/'+encodeURIComponent(actorId),{
   method:'GET',headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},signal:controller.signal
  });
  if(!response.ok)return null;
  return parseApifyActorPricing(await response.json());
 }catch{return null}finally{clearTimeout(timer)}
}
