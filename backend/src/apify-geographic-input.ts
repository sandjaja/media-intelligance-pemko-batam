import type {GeographicSearchPlan} from './apify-geographic-search.js';

/** Dry-run only: platform-specific input candidates must be checked against
 * the installed Actor input schema before they can be used for paid runs.
 * This module never starts an Actor and is not a verified Actor schema.
 */
export function previewGeographicActorInput(input:{actorId:string;plan:GeographicSearchPlan;maxQueries?:number}):
 {actorId:string;schemaVerified:false;readyForPaidRun:false;searchTerms:string[];proposedInput:Record<string,unknown>;blockers:string[]}{
 const limit=input.maxQueries??5;
 if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('APIFY_SEARCH_LIMIT_INVALID');
 if(!input.plan.city||!input.plan.queries.length)throw Error('APIFY_GEOGRAPHIC_PLAN_EMPTY');
 // Require each proposed query to carry the active city, so a bare area name
 // cannot accidentally trigger an unrelated, billable nationwide search.
 const city=input.plan.city.normalize('NFKC').trim().toLocaleLowerCase('id');
 if(city.length<3||city.length>80)throw Error('APIFY_GEOGRAPHIC_CITY_INVALID');
 const searchTerms=input.plan.queries.slice(0,limit);
 if(searchTerms.some(q=>typeof q!=='string'||q.length<3||q.length>100||
   !q.normalize('NFKC').toLocaleLowerCase('id').split(/\s+/).includes(city)))
  throw Error('APIFY_GEOGRAPHIC_QUERY_OUT_OF_SCOPE');
 let proposedInput:Record<string,unknown>={};
 if(input.actorId==='clockworks/tiktok-scraper'){
  proposedInput={searchQueries:searchTerms,searchSection:'/video',resultsPerPage:5,scrapeRelatedVideos:false,commentsPerPost:0,shouldDownloadVideos:false,aiVideoDescription:false,aiVideoSummary:false};
 }else if(input.actorId==='apify/instagram-scraper'){
  proposedInput={search:searchTerms[0],searchType:'place',resultsType:'posts',resultsLimit:5,searchLimit:1};
 }else{
  throw Error('APIFY_GEOGRAPHIC_ACTOR_NOT_SUPPORTED');
 }
 return{actorId:input.actorId,schemaVerified:false,readyForPaidRun:false,searchTerms,proposedInput,
  blockers:['APIFY_ACTOR_INPUT_RUNTIME_NOT_VERIFIED','APIFY_PAID_EXECUTION_NOT_CONNECTED']};
}
