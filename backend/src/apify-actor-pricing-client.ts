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
export type ApifyPricingLookup={snapshot:ApifyActorPricingSnapshot|null;metadataShape?:'NO_DATA'|'NO_PRICING_INFO'|'MISSING_PRICING_MODEL'|'UNKNOWN_PRICING_MODEL';reason:'OK'|'INVALID_ACTOR_OR_TOKEN'|'HTTP_UNAVAILABLE'|'UNSUPPORTED_METADATA'|'NETWORK_UNAVAILABLE'};
export async function inspectApifyActorPricing(actorId:string,apiKey:string,fetcher:typeof fetch=fetch):Promise<ApifyPricingLookup>{
 if(!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(actorId)||!apiKey.trim())return{snapshot:null,reason:'INVALID_ACTOR_OR_TOKEN'};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher('https://api.apify.com/v2/acts/'+actorId.replace('/','~'),{
   method:'GET',headers:{Authorization:'Bearer '+apiKey,Accept:'application/json'},signal:controller.signal
  });
  if(!response.ok)return{snapshot:null,reason:'HTTP_UNAVAILABLE'};
  const payload:unknown=await response.json();
  const snapshot=parseApifyActorPricing(payload);
  if(snapshot)return{snapshot,reason:'OK'};
  // Report only fixed diagnostic categories. Never expose provider payload or token.
  const data=payload&&typeof payload==='object'?(payload as Record<string,unknown>).data:null;
  const info=data&&typeof data==='object'&&!Array.isArray(data)?(data as Record<string,unknown>).pricingInfo:null;
  const metadataShape=!data||typeof data!=='object'||Array.isArray(data)?'NO_DATA':!info||typeof info!=='object'||Array.isArray(info)?'NO_PRICING_INFO':typeof (info as Record<string,unknown>).pricingModel!=='string'?'MISSING_PRICING_MODEL':'UNKNOWN_PRICING_MODEL';
  return{snapshot:null,reason:'UNSUPPORTED_METADATA',metadataShape};
 }catch{return{snapshot:null,reason:'NETWORK_UNAVAILABLE'}}finally{clearTimeout(timer)}
}
export async function fetchApifyActorPricing(actorId:string,apiKey:string,fetcher:typeof fetch=fetch):Promise<ApifyActorPricingSnapshot|null>{
 return (await inspectApifyActorPricing(actorId,apiKey,fetcher)).snapshot;
}
