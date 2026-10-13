import {normalizeApifyPosts,type ApifyPlatform} from './apify-social-adapter.js';
import type {SocialCandidate} from './social-collector.js';

/** Hashtag discovery is separate from the account/post and comment collectors.
 * Actor IDs must be explicitly configured and verified by an administrator.
 * No Actor is executed by this module. */
export type ApifyHashtagCollectorConfig={
 platform:ApifyPlatform;
 actorId:string;
 hashtags:string[];
 maxItemsPerTag:number;
};
export function normalizeHashtag(tag:string):string{
 const clean=tag.trim().replace(/^#+/,'').toLocaleLowerCase('en-US');
 if(!clean||clean.length>100||!/^[\p{L}\p{N}_.]+$/u.test(clean))throw new Error('INVALID_APIFY_HASHTAG');
 return clean;
}
export function validateHashtagCollector(config:ApifyHashtagCollectorConfig):ApifyHashtagCollectorConfig{
 if(!/^[\w-]+\/[\w-]+$/.test(config.actorId))throw new Error('APIFY_HASHTAG_ACTOR_NOT_CONFIGURED');
 if(!Number.isSafeInteger(config.maxItemsPerTag)||config.maxItemsPerTag<1||config.maxItemsPerTag>50)throw new Error('INVALID_APIFY_HASHTAG_LIMIT');
 const hashtags=[...new Set(config.hashtags.map(normalizeHashtag))];
 if(!hashtags.length||hashtags.length>20)throw new Error('INVALID_APIFY_HASHTAG_COUNT');
 return{...config,hashtags};
}
export function normalizeHashtagResults(platform:ApifyPlatform,tag:string,items:unknown[]):SocialCandidate[]{
 const hashtag=normalizeHashtag(tag);
 return normalizeApifyPosts(platform,items).map(candidate=>({
  ...candidate,
  metadata:{...candidate.metadata,discoveryMethod:'hashtag',discoveryHashtag:hashtag}
 }));
}
export const APIFY_HASHTAG_COLLECTOR_KINDS=['instagram_hashtag','tiktok_hashtag'] as const;
