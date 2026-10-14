import type {Pool} from 'pg';
import {verifyCompletedApifyRunDataset} from './apify-run-dataset-verification.js';
import {fetchApifyTikTokDataset} from './apify-tiktok-dataset.js';
import {normalizeApifyInstagramPosts} from './apify-instagram-post-normalizer.js';
import {loadOrganizationMediaScope} from './organization-media-scope.js';
import {classifySocialOrganizationScope} from './social-organization-scope.js';
import {ingestSocialBatch} from './social-collector.js';

/** Dataset-only Instagram import. Caller must independently verify that the
 * dataset belongs to a completed authorized Instagram Posts run.
 * Never accept a dataset ID directly from an unauthenticated browser request.
 */
export async function ingestCompletedApifyInstagramDataset(pool:Pool,input:{
 datasetId:string;token:string;confirmedRunId:string;expectedActorInternalId:string;fetcher?:typeof fetch;limit?:number
}){
 if(!/^[a-zA-Z0-9_-]{5,160}$/.test(input.confirmedRunId))throw Error('APIFY_RUN_ID_INVALID');
 await verifyCompletedApifyRunDataset({runId:input.confirmedRunId,datasetId:input.datasetId,actorId:'apify/instagram-scraper',expectedActorInternalId:input.expectedActorInternalId,token:input.token,fetcher:input.fetcher});
 const items=await fetchApifyTikTokDataset(input);
 const {candidates,rejected}=normalizeApifyInstagramPosts(items);
 const scope=await loadOrganizationMediaScope(pool);
 if(!scope)throw Error('APIFY_ORGANIZATION_SCOPE_UNAVAILABLE');
 const inScope=candidates.filter(candidate=>classifySocialOrganizationScope({title:candidate.title,content:candidate.content},scope).status!=='OUT_OF_SCOPE');
 const outOfScope=candidates.length-inScope.length;
 const result=inScope.length?await ingestSocialBatch(pool,inScope,'apify-instagram-posts'):{received:0,succeeded:0,failed:0,results:[]};
 return{datasetItems:items.length,rejected,outOfScope,...result};
}
