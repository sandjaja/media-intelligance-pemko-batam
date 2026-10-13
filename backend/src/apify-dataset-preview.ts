import {normalizeApifyPosts,normalizeApifyComments,type ApifyPlatform} from './apify-social-adapter.js';
import type {SocialCandidate} from './social-collector.js';

export type ApifyDatasetPreview={
 actorRunId:string;
 datasetId:string;
 platform:ApifyPlatform;
 kind:'posts'|'comments';
 received:number;
 accepted:number;
 rejected:number;
 candidates:SocialCandidate[];
};
const idPattern=/^[a-zA-Z0-9]{8,64}$/;
/**
 * Read-only dataset inspection. Does NOT start an Actor, persist data, or
 * provide an execution bypass for the fail-closed budget guard.
 * Caller must authorize the operation and supply a verified dataset ID.
 */
export async function previewApifyDataset(options:{
 token:string;datasetId:string;actorRunId:string;platform:ApifyPlatform;
 kind:'posts'|'comments';limit?:number;parentUrl?:string;fetcher?:typeof fetch;
}):Promise<ApifyDatasetPreview>{
 if(!options.token.trim())throw new Error('APIFY_TOKEN_REQUIRED');
 if(!idPattern.test(options.datasetId)||!idPattern.test(options.actorRunId))throw new Error('INVALID_APIFY_DATASET_IDENTIFIER');
 const limit=Math.min(50,Math.max(1,Math.floor(options.limit??10)));
 const url=new URL('https://api.apify.com/v2/datasets/'+encodeURIComponent(options.datasetId)+'/items');
 url.searchParams.set('limit',String(limit));url.searchParams.set('clean','true');url.searchParams.set('format','json');
 const fetcher=options.fetcher??fetch;
 const response=await fetcher(url,{headers:{authorization:'Bearer '+options.token,accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('APIFY_DATASET_HTTP_'+response.status);
 const payload:unknown=await response.json();
 if(!Array.isArray(payload))throw new Error('APIFY_DATASET_INVALID_RESPONSE');
 const candidates=options.kind==='posts'?normalizeApifyPosts(options.platform,payload):normalizeApifyComments(options.platform,payload,options.parentUrl);
 return{actorRunId:options.actorRunId,datasetId:options.datasetId,platform:options.platform,kind:options.kind,received:payload.length,accepted:candidates.length,rejected:payload.length-candidates.length,candidates};
}
