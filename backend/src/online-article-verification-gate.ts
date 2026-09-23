import { diagnoseOriginalArticleHtml, verifyOriginalArticleHtml, type ArticleDateEvidence } from './online-article-verification.js';

export type OnlineArticleCandidate={sourceId:string;title:string;url:string;publishedAt?:Date;excerpt?:string;fallbackEvidence?:'GOOGLE_NEWS_RSS';expectedPublisherUrl?:string};
export type VerifiedOnlineArticleCandidate={sourceId:string;title:string;url:string;publishedAt:Date;excerpt:string;publishedAtEvidence:ArticleDateEvidence};

const USER_AGENT='Mozilla/5.0 (compatible; GovernmentMediaIntelligence/3.0)';
const MAX_ARTICLE_AGE_MS=7*24*60*60*1000;
const FUTURE_TOLERANCE_MS=60*60*1000;
const FALLBACK_EXCERPT_MIN=20;

function normalizedHost(value:string){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return''}}
function samePublisher(candidateUrl:string,verifiedUrl:string){const a=normalizedHost(candidateUrl),b=normalizedHost(verifiedUrl);if(!a||!b)return false;return a===b||a.endsWith(`.${b}`)||b.endsWith(`.${a}`);}
function fresh(publishedAt:Date,now=Date.now()){const t=publishedAt.getTime();return Number.isFinite(t)&&t>=now-MAX_ARTICLE_AGE_MS&&t<=now+FUTURE_TOLERANCE_MS;}
function trustedFallback(candidate:OnlineArticleCandidate):VerifiedOnlineArticleCandidate|null{
  if(candidate.fallbackEvidence!=='GOOGLE_NEWS_RSS'||!candidate.expectedPublisherUrl||!samePublisher(candidate.url,candidate.expectedPublisherUrl))return null;
  if(!candidate.publishedAt||!fresh(candidate.publishedAt)||candidate.title.trim().length<5)return null;
  const excerpt=String(candidate.excerpt||'').trim();if(excerpt.length<FALLBACK_EXCERPT_MIN)return null;
  return{sourceId:candidate.sourceId,title:candidate.title.trim().slice(0,1000),url:candidate.url,publishedAt:candidate.publishedAt,excerpt,publishedAtEvidence:'GOOGLE_NEWS_RSS' as ArticleDateEvidence};
}
async function fetchOriginal(url:string,timeoutMs=8000){const response=await fetch(url,{headers:{'user-agent':USER_AGENT,accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8','accept-language':'id-ID,id;q=0.9,en;q=0.7','cache-control':'no-cache',pragma:'no-cache',referer:'https://www.google.com/'},signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});const type=response.headers.get('content-type')?.toLowerCase()??'';if(!response.ok)return{html:'',url:response.url||url,status:response.status,type};if(!type.includes('text/html'))return{html:'',url:response.url||url,status:response.status,type};return{html:await response.text(),url:response.url||url,status:response.status,type};}

export async function verifyDiscoveredArticle(candidate:OnlineArticleCandidate):Promise<VerifiedOnlineArticleCandidate|null>{
  try{
    const fetched=await fetchOriginal(candidate.url);
    if(!fetched)return trustedFallback(candidate);
    if(fetched.status!==200){console.info({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'HTTP_STATUS',status:fetched.status,url:candidate.url},'online article verifier diagnostic');return trustedFallback(candidate);}
    if(!fetched.type.includes('text/html')){console.info({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'CONTENT_TYPE',type:fetched.type,url:candidate.url},'online article verifier diagnostic');return trustedFallback(candidate);}
    const verified=verifyOriginalArticleHtml(fetched.html,fetched.url,candidate.title);
    if(!verified){const detail=diagnoseOriginalArticleHtml(fetched.html,fetched.url,candidate.title);console.info(JSON.stringify({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'PARSE_OR_REQUIRED_EVIDENCE',detail,url:fetched.url,title:candidate.title.slice(0,120)}),'online article verifier diagnostic');return null;}
    if(!fresh(verified.publishedAt)){console.info({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'STALE_OR_FUTURE',publishedAt:verified.publishedAt.toISOString(),url:verified.url},'online article verifier diagnostic');return null;}
    if(!samePublisher(fetched.url,verified.url)){console.info({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'PUBLISHER_MISMATCH',fetchedUrl:fetched.url,verifiedUrl:verified.url},'online article verifier diagnostic');return null;}
    return{sourceId:candidate.sourceId,title:verified.title,url:verified.url,publishedAt:verified.publishedAt,excerpt:verified.excerpt,publishedAtEvidence:verified.publishedAtEvidence};
  }catch(error){console.info({stage:'article_verify_reject',sourceId:candidate.sourceId,reason:'FETCH_EXCEPTION',url:candidate.url,error:error instanceof Error?error.message:String(error)},'online article verifier diagnostic');return trustedFallback(candidate);}
}

export async function verifyDiscoveredArticles(candidates:OnlineArticleCandidate[],options?:{concurrency?:number;limit?:number}):Promise<VerifiedOnlineArticleCandidate[]>{
  const concurrency=Math.max(1,Math.min(8,options?.concurrency??4));
  const limit=Math.max(1,options?.limit??120);
  const unique=[...new Map(candidates.filter(x=>x?.url&&x?.title).map(x=>[x.url.trim().toLowerCase(),x])).values()].slice(0,limit);
  const output:Array<VerifiedOnlineArticleCandidate|null>=new Array(unique.length).fill(null);
  let cursor=0;
  async function worker(){while(true){const index=cursor++;if(index>=unique.length)return;output[index]=await verifyDiscoveredArticle(unique[index]);}}
  await Promise.all(Array.from({length:Math.min(concurrency,unique.length)},()=>worker()));
  return output.filter((x):x is VerifiedOnlineArticleCandidate=>!!x).sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime());
}
