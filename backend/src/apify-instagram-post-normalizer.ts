import type {SocialCandidate} from './social-collector.js';

/** Strict normalization of public Instagram posts from an Apify dataset.
 * Does not call Apify or persist data. Unknown records are rejected.
 */
export function normalizeApifyInstagramPosts(items:unknown[]):{candidates:SocialCandidate[];rejected:number}{
 const candidates:SocialCandidate[]=[];
 let rejected=0;
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)){rejected++;continue;}
  const row=item as Record<string,unknown>;
  const shortcode=typeof row.shortCode==='string'?row.shortCode:typeof row.shortcode==='string'?row.shortcode:null;
  const caption=typeof row.caption==='string'?row.caption.trim():null;
  const rawUrl=typeof row.url==='string'?row.url:null;
  if(!shortcode||!/^[A-Za-z0-9_-]{5,32}$/.test(shortcode)||!caption||!rawUrl){rejected++;continue;}
  let canonicalUrl:string;
  try{
   const url=new URL(rawUrl);
   if(url.protocol!=='https:'||!['instagram.com','www.instagram.com'].includes(url.hostname)){rejected++;continue;}
   const match=url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{5,32})\/?$/);
   if(!match||match[2]!==shortcode){rejected++;continue;}
   canonicalUrl='https://www.instagram.com/'+match[1]+'/'+shortcode+'/';
  }catch{rejected++;continue;}
  const owner=typeof row.ownerUsername==='string'&&/^[A-Za-z0-9._]{1,30}$/.test(row.ownerUsername)?row.ownerUsername:null;
  const date=typeof row.timestamp==='string'?new Date(row.timestamp):null;
  const publishedAt=date&&!Number.isNaN(date.getTime())?date.toISOString():null;
  candidates.push({platform:'instagram',externalId:shortcode,contentType:canonicalUrl.includes('/reel/')?'reel':'post',sourceKind:'external',
   canonicalUrl,title:caption.slice(0,300),content:caption.slice(0,100000),authorHandle:owner,publishedAt,
   collector:'apify-instagram-posts',metadata:{provider:'apify',actorId:'apify/instagram-scraper'}});
 }
 return{candidates,rejected};
}
