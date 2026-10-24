import type {SocialCandidate} from './social-collector.js';

/** Strict read-only mapping of Apify TikTok Posts dataset items.
 * Unknown or incomplete provider shapes are skipped, never fabricated.
 * This function does not run Actors, write data or classify evidence.
 */
export function normalizeApifyTikTokPosts(items:unknown[]):{candidates:SocialCandidate[];rejected:number}{
 const candidates:SocialCandidate[]=[];
 let rejected=0;
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)){rejected++;continue;}
  const row=item as Record<string,unknown>;
  const id=typeof row.id==='string'?row.id:typeof row.id==='number'&&Number.isSafeInteger(row.id)?String(row.id):null;
  const text=typeof row.text==='string'?row.text.trim():null;
  const webUrl=typeof row.webVideoUrl==='string'?row.webVideoUrl:null;
  if(!id||!/^[0-9]{8,30}$/.test(id)||!text||!webUrl){rejected++;continue;}
  let canonicalUrl:string;
  try{
   const url=new URL(webUrl);
   if(url.protocol!=='https:'||!['www.tiktok.com','tiktok.com','m.tiktok.com'].includes(url.hostname)||!url.pathname.includes('/video/'+id)){rejected++;continue;}
   canonicalUrl=url.origin+url.pathname;
  }catch{rejected++;continue;}
  const author=row.author&&typeof row.author==='object'&&!Array.isArray(row.author)?row.author as Record<string,unknown>:{};
  const handle=typeof author.uniqueId==='string'&&/^[a-zA-Z0-9._]{1,30}$/.test(author.uniqueId)?author.uniqueId:null;
  const created=typeof row.createTime==='number'&&Number.isFinite(row.createTime)&&row.createTime>0?new Date(row.createTime*1000):null;
  const publishedAt=created&&!Number.isNaN(created.getTime())?created.toISOString():null;
  candidates.push({platform:'tiktok',externalId:id,contentType:'video',sourceKind:'external',
   canonicalUrl,title:text.slice(0,300),content:text.slice(0,100000),
   authorHandle:handle,publishedAt,collector:'apify-tiktok-posts',
   metadata:{provider:'apify',actorId:'clockworks/tiktok-scraper'}});
 }
 return{candidates,rejected};
}
