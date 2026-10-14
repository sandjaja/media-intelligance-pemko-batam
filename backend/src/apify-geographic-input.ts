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
 const searchTerms=input.plan.queries.slice(0,limit);
 let proposedInput:Record<string,unknown>={};
 if(input.actorId==='clockworks/tiktok-scraper'){
  proposedInput={searchQueries:searchTerms,resultsPerPage:10};
 }else if(input.actorId==='apify/instagram-scraper'){
  proposedInput={search:searchTerms,resultsLimit:10};
 }else{
  throw Error('APIFY_GEOGRAPHIC_ACTOR_NOT_SUPPORTED');
 }
 return{actorId:input.actorId,schemaVerified:false,readyForPaidRun:false,searchTerms,proposedInput,
  blockers:['APIFY_ACTOR_INPUT_SCHEMA_NOT_VERIFIED','APIFY_PAID_EXECUTION_NOT_CONNECTED']};
}
