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
