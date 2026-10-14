/** Read-only Apify run provenance verification. This does not start an Actor.
 * Caller must additionally authorize the run against its own immutable ledger.
 */
export async function verifyCompletedApifyRunDataset(input:{
 runId:string;datasetId:string;actorId:'clockworks/tiktok-scraper'|'apify/instagram-scraper';
 token:string;fetcher?:typeof fetch
}):Promise<void>{
 const id=/^[a-zA-Z0-9_-]{5,160}$/;
 if(!id.test(input.runId)||!id.test(input.datasetId))throw Error('APIFY_RUN_OR_DATASET_ID_INVALID');
 if(!input.token.trim())throw Error('APIFY_TOKEN_REQUIRED');
 const url='https://api.apify.com/v2/actor-runs/'+encodeURIComponent(input.runId);
 const response=await(input.fetcher??fetch)(url,{headers:{Authorization:'Bearer '+input.token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('APIFY_RUN_METADATA_FETCH_FAILED_'+response.status);
 const payload:unknown=await response.json();
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('APIFY_RUN_METADATA_INVALID');
 const run=(payload as Record<string,unknown>).data;
 if(!run||typeof run!=='object'||Array.isArray(run))throw Error('APIFY_RUN_METADATA_INVALID');
 const data=run as Record<string,unknown>;
 if(data.id!==input.runId||data.status!=='SUCCEEDED'||data.defaultDatasetId!==input.datasetId)throw Error('APIFY_RUN_DATASET_PROVENANCE_MISMATCH');
 const actor=data.actId;
 if(typeof actor!=='string'||!actor.trim())throw Error('APIFY_RUN_ACTOR_ID_MISSING');
 // The Apify run exposes actId (internal Actor ID), not necessarily the
 // owner/name slug. The caller must resolve/verify this identity separately.
 throw Error('APIFY_RUN_ACTOR_IDENTITY_NOT_VERIFIED');
}
