import type { SocialCandidate } from './social-collector.js';
export type ApifyPlatform='tiktok'|'instagram';
type RecordValue=Record<string,unknown>;
const record=(v:unknown):RecordValue=>v&&typeof v==='object'&&!Array.isArray(v)?v as RecordValue:{};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const first=(...values:unknown[])=>values.map(str).find(Boolean)||'';
const date=(v:unknown):string|null=>{
 if(typeof v==='number'&&Number.isFinite(v)){const d=new Date(v<1e12?v*1000:v);return Number.isNaN(d.getTime())?null:d.toISOString()}
 if(typeof v==='string'&&v.trim()){const d=new Date(v);return Number.isNaN(d.getTime())?null:d.toISOString()}
 return null;
};
/** Pure normalization; no Apify API calls, DB writes, or Actor execution. */
export function normalizeApifyPost(platform:ApifyPlatform,input:unknown):SocialCandidate|null{
 const row=record(input),author=record(row.author),owner=record(row.owner);
 const externalId=first(row.id,row.postId,row.videoId,row.shortCode,row.code);
 const canonicalUrl=first(row.webVideoUrl,row.videoUrl,row.url,row.postUrl,row.inputUrl);
 const content=first(row.text,row.caption,row.desc,row.description);
 if(!externalId&&!canonicalUrl)return null;
 const handle=first(row.authorMeta&&record(row.authorMeta).name,author.uniqueId,author.username,owner.username,row.ownerUsername,row.username);
 return{platform,externalId:externalId||null,contentType:platform==='tiktok'?'video':first(row.type)==='Video'?'reel':'post',sourceKind:'external',
  authorName:first(row.authorName,author.nickname,owner.fullName,row.ownerFullName)||null,
  authorHandle:handle||null,canonicalUrl:canonicalUrl||null,title:content.slice(0,220)||null,content:content||null,
  publishedAt:date(row.createTimeISO)||date(row.createTime)||date(row.timestamp)||date(row.takenAt)||date(row.timestampMs),
  collector:'apify',rawPayload:row,metadata:{provider:'apify',actorPlatform:platform}};
}
export function normalizeApifyPosts(platform:ApifyPlatform,items:unknown[]):SocialCandidate[]{
 const seen=new Set<string>(),out:SocialCandidate[]=[];
 for(const item of items){const candidate=normalizeApifyPost(platform,item);if(!candidate)continue;
 const key=candidate.externalId||candidate.canonicalUrl||'';if(seen.has(key))continue;seen.add(key);out.push(candidate)}
 return out;
}

/** Comments require a stable parent post URL and comment identifier to prevent
 * orphan records and accidental duplication across repeated Actor runs. */
export function normalizeApifyComment(platform:ApifyPlatform,input:unknown,parentUrl?:string):SocialCandidate|null{
 const row=record(input),author=record(row.author),user=record(row.user);
 const externalId=first(row.id,row.commentId,row.cid,row.pk);
 const content=first(row.text,row.comment,row.content);
 const parent=first(row.postUrl,row.videoUrl,row.parentUrl,row.inputUrl,parentUrl);
 if(!externalId||!parent||!content)return null;
 const handle=first(row.username,row.ownerUsername,author.uniqueId,author.username,user.username);
 const publishedAt=date(row.createTimeISO)||date(row.createTime)||date(row.createdAt)||date(row.timestamp);
 return{platform,externalId:'comment:'+externalId,contentType:'comment',sourceKind:'external',
  authorName:first(row.authorName,author.nickname,user.fullName)||null,authorHandle:handle||null,
  canonicalUrl:first(row.url,row.commentUrl)||parent,title:content.slice(0,220),content,
  publishedAt,collector:'apify',rawPayload:row,
  metadata:{provider:'apify',actorPlatform:platform,parentUrl:parent,externalCommentId:externalId}};
}
export function normalizeApifyComments(platform:ApifyPlatform,items:unknown[],parentUrl?:string):SocialCandidate[]{
 const seen=new Set<string>(),out:SocialCandidate[]=[];
 for(const item of items){const candidate=normalizeApifyComment(platform,item,parentUrl);if(!candidate)continue;
 const key=candidate.externalId||'';if(seen.has(key))continue;seen.add(key);out.push(candidate)}
 return out;
}
