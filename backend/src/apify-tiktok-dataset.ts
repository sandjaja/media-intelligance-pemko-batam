import type {Pool} from 'pg';
import {ingestSocialBatch} from './social-collector.js';
import {normalizeApifyTikTokPosts} from './apify-tiktok-post-normalizer.js';
import {loadOrganizationMediaScope} from './organization-media-scope.js';
import {classifySocialOrganizationScope} from './social-organization-scope.js';

type Fetcher=typeof fetch;
export async function fetchApifyTikTokDataset(input:{datasetId:string;token:string;fetcher?:Fetcher;limit?:number}):Promise<unknown[]>{
 if(!/^[a-zA-Z0-9_-]{5,160}$/.test(input.datasetId))throw Error('APIFY_DATASET_ID_INVALID');
 if(!input.token.trim())throw Error('APIFY_TOKEN_REQUIRED');
 const limit=input.limit??100;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('APIFY_DATASET_LIMIT_INVALID');
 const url=new URL('https://api.apify.com/v2/datasets/'+encodeURIComponent(input.datasetId)+'/items');
 url.searchParams.set('limit',String(limit));
 url.searchParams.set('clean','true');
 const response=await(input.fetcher??fetch)(url,{headers:{Authorization:'Bearer '+input.token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('APIFY_DATASET_FETCH_FAILED_'+response.status);
 const items:unknown=await response.json();
 if(!Array.isArray(items)||items.length>limit)throw Error('APIFY_DATASET_SHAPE_INVALID');
 return items;
}

/** Only call after the run has completed successfully and its dataset belongs to
 * the confirmed run. Never import arbitrary dataset IDs from browser requests.
 */
export async function ingestCompletedApifyTikTokDataset(pool:Pool,input:{
 datasetId:string;token:string;confirmedRunId:string;fetcher?:Fetcher;limit?:number
}){
 if(!/^[a-zA-Z0-9_-]{5,160}$/.test(input.confirmedRunId))throw Error('APIFY_RUN_ID_INVALID');
 const items=await fetchApifyTikTokDataset(input);
 const {candidates,rejected}=normalizeApifyTikTokPosts(items);
 const scope=await loadOrganizationMediaScope(pool);
 if(!scope)throw Error('APIFY_ORGANIZATION_SCOPE_UNAVAILABLE');
 const inScope=candidates.filter(candidate=>classifySocialOrganizationScope({title:candidate.title,content:candidate.content},scope).status!=='OUT_OF_SCOPE');
 const outOfScope=candidates.length-inScope.length;
 const result=inScope.length?await ingestSocialBatch(pool,inScope,'apify-tiktok-posts'):{received:0,succeeded:0,failed:0,results:[]};
 return{datasetItems:items.length,rejected,outOfScope,...result};
}
