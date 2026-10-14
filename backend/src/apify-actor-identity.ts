/** Resolve an Actor's immutable internal ID from Apify using a trusted,
 * server-configured owner/name slug. Read-only; never starts paid runs.
 */
export async function resolveApifyActorInternalId(input:{
 actorId:'clockworks/tiktok-scraper'|'apify/instagram-scraper';
 token:string;fetcher?:typeof fetch
}):Promise<string>{
 if(!input.token.trim())throw Error('APIFY_TOKEN_REQUIRED');
 const url='https://api.apify.com/v2/acts/'+input.actorId.replace('/','~');
 const response=await(input.fetcher??fetch)(url,{headers:{Authorization:'Bearer '+input.token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('APIFY_ACTOR_METADATA_FETCH_FAILED_'+response.status);
 const payload:unknown=await response.json();
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('APIFY_ACTOR_METADATA_INVALID');
 const data=(payload as Record<string,unknown>).data;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('APIFY_ACTOR_METADATA_INVALID');
 const actor=data as Record<string,unknown>;
 const id=actor.id;
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{5,160}$/.test(id))throw Error('APIFY_ACTOR_INTERNAL_ID_INVALID');
 return id;
}
