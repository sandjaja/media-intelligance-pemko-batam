import {z} from 'zod';
export const socialFeedSchema=z.enum(['main','comments','hashtag','all']);
/** Categories are disjoint: hashtag discovery is not inferred from text containing #. */
export function socialFeedPredicate(feed:'main'|'comments'|'hashtag'|'all',alias:''|'sm'=''){
 const prefix=alias?alias+'.':'';
 const parent=`COALESCE(${prefix}content_type,'post') NOT IN ('comment','reply')`;
 const hashtag=`(COALESCE(${prefix}metadata->>'collectorKind','') IN ('tiktok_hashtag','instagram_hashtag') OR COALESCE(${prefix}collector,'') IN ('apify-tiktok_hashtag','apify-instagram_hashtag','apify-tiktok-hashtag','apify-instagram-hashtag'))`;
 return feed==='comments'?`${prefix}content_type IN ('comment','reply')`:feed==='hashtag'?`${parent} AND ${hashtag}`:feed==='main'?`${parent} AND NOT ${hashtag}`:'TRUE';
}
