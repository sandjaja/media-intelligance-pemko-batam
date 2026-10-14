import {buildApifyChargeCap} from './apify-run-charge-cap.js';

/** Pure request builder for Apify's synchronous run endpoint.
 * Does not fetch, reserve money, or run Actors. Never put API tokens in URLs.
 * The eventual executor must enforce atomic reservation and confirm pricing
 * before using the returned request.
 */
export function prepareApifyRunRequest(input:{
 actorId:string;configuredActorId:string;configuredMaxUsd:number|null;
 reservedUsd:number|null;pricingVerified:boolean;collectorEnabled:boolean;
}):{path:string;query:{maxTotalChargeUsd:number};method:'POST'}|null{
 const approved=new Set([
  'clockworks/tiktok-scraper','apify/instagram-scraper',
  'clockworks/tiktok-comments-scraper','apidojo/instagram-comments-scraper-api',
  'clockworks/tiktok-hashtag-scraper','apify/instagram-hashtag-scraper'
 ]);
 if(!approved.has(input.actorId))return null;
 const cap=buildApifyChargeCap(input);
 if(!cap)return null;
 if(!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(input.actorId))return null;
 return{
  path:'/v2/acts/'+input.actorId.replace('/','~')+'/runs',
  query:cap,
  method:'POST'
 };
}
