import { XMLParser } from 'fast-xml-parser';
import { filterArticlesByOrganizationScope, organizationScopeTerms, type OrganizationMediaScope } from './organization-media-scope.js';
import { verifyDiscoveredArticles } from './online-article-verification-gate.js';

export type OnlineSource = { id:string; name:string; url:string; active?:boolean };
export type OnlineArticle = { sourceId:string; title:string; url:string; publishedAt:Date; excerpt?:string };

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_'});
const USER_AGENT='Mozilla/5.0 (compatible; GovernmentMediaIntelligence/3.0)';
const MAX_ARTICLE_AGE_MS=7*24*60*60*1000;
const FUTURE_TOLERANCE_MS=60*60*1000;
const asArray=<T>(v:T|T[]|undefined):T[]=>v==null?[]:Array.isArray(v)?v:[v];
const firstString=(...values:unknown[]):string|undefined=>values.find(v=>typeof v==='string'&&v.trim()) as string|undefined;
const stripHtml=(value?:string)=>value?value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim():undefined;
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const ID_MONTHS:Record<string,number>={januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11};
function parseDate(value?:string):Date|null{
  if(!value?.trim())return null;
  const raw=value.trim();
  const direct=new Date(raw);
  if(!Number.isNaN(direct.getTime()))return direct;
  const normalized=raw.toLowerCase().replace(/\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\b\s*,?/g,' ').replace(/\s+/g,' ').trim();
  const m=normalized.match(/(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})(?:[^\d]+(\d{1,2})[.:](\d{2})(?::(\d{2}))?)?/i);
  if(!m)return null;
  const d=new Date(Date.UTC(Number(m[3]),ID_MONTHS[m[2].toLowerCase()],Number(m[1]),Number(m[4]||0)-7,Number(m[5]||0),Number(m[6]||0)));
  return Number.isNaN(d.getTime())?null:d;
}
function isFresh(article:OnlineArticle,now=Date.now()){const t=article.publishedAt.getTime();return Number.isFinite(t)&&t>=now-MAX_ARTICLE_AGE_MS&&t<=now+FUTURE_TOLERANCE_MS}
function freshOnly(items:OnlineArticle[]){const now=Date.now();return items.filter(item=>isFresh(item,now))}
function scopeOnly(items:OnlineArticle[],scope:OrganizationMediaScope|null|undefined){return scope?filterArticlesByOrganizationScope(items,scope):items}
async function verifyCandidates(items:OnlineArticle[],scope?:OrganizationMediaScope|null){const verified=await verifyDiscoveredArticles(items,{concurrency:4,limit:120});return scopeOnly(verified.map(({publishedAtEvidence:_,...item})=>item),scope);}

function normalizeSourceUrl(source:OnlineSource){try{return new URL(source.url).toString()}catch{return source.url}}
function sourceDomain(url:string){try{return new URL(url).hostname.replace(/^www\./i,'')}catch{return''}}
function publisherDomain(url:string){const host=sourceDomain(url);if(!host)return'';const parts=host.split('.').filter(Boolean);if(parts.length<=2)return host;const secondLevelCountry=new Set(['co.id','ac.id','or.id','go.id','sch.id','web.id','my.id','biz.id']);const suffix=parts.slice(-2).join('.');return secondLevelCountry.has(suffix)&&parts.length>=3?parts.slice(-3).join('.'):parts.slice(-2).join('.')}
function samePublisherDomain(a:string,b:string){const left=publisherDomain(a),right=publisherDomain(b);return!!left&&left===right}
function sourcePathTerms(source:OnlineSource){
  try{
    return new URL(source.url).pathname.toLowerCase().split('/').filter(Boolean)
      .filter(x=>x.length>=4&&!/^(news|berita|artikel|index|home|tag|topic|category|kategori)$/.test(x))
      .slice(0,2).map(x=>x.replace(/[-_]+/g,' '));
  }catch{return[] as string[]}
}
function sourceContext(source:OnlineSource,scope?:OrganizationMediaScope|null){
  const scopeTerms=scope?organizationScopeTerms(scope):{strong:[],supporting:[]};
  const preferred=[scope?.cityName,scope?.shortName,scope?.governmentName,scope?.organizationName]
    .map(v=>String(v||'').trim()).filter(Boolean).slice(0,4);
  const terms=preferred.length?preferred:[...scopeTerms.strong.slice(0,3),...sourcePathTerms(source)];
  return [...new Set(terms.map(x=>x.trim()).filter(Boolean))].slice(0,4);
}
function googleNewsUrl(source:OnlineSource,targetUrl:string,scope?:OrganizationMediaScope|null){
  const domain=publisherDomain(targetUrl)||publisherDomain(source.url);
  if(!domain)return null;
  const terms=sourceContext(source,scope);
  const localQuery=terms.length?`(${terms.map(term=>`"${term.replace(/"/g,'')}"`).join(' OR ')})`:sourcePathTerms(source).join(' ');
  const q=encodeURIComponent(`site:${domain}${localQuery?` ${localQuery}`:''}`);
  return `https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`;
}

function isNonArticlePath(path:string){
  return /\/(?:tag|topic|topics|author|penulis|search|cari|wp-admin|wp-content|feed|category|kategori|kanal|channel|foto|photo|video)(?:\/|$)/i.test(path)
    || /\/(?:index|home)(?:\.html?)?(?:\/|$)/i.test(path);
}
function likelyArticlePath(url:string,domain=sourceDomain(url)){
  try{
    const u=new URL(url),path=u.pathname.toLowerCase().replace(/\/+$/,'');
    if(!path||path==='/')return false;
    if(isNonArticlePath(path))return false;
    if(/antaranews\.com$/i.test(domain))return /\/berita\/\d+(?:\/|$)/.test(path);
    if(/tribunnews\.com$/i.test(domain))return /^\/(?:[^/]+)\/\d{4,}\/[^/]+/.test(path);
    if(/jawapos\.com$/i.test(domain))return /\/berita\//.test(path)||/\/20\d{2}\//.test(path)||path.split('/').filter(Boolean).length>=3;
    return /\/20\d{2}\//.test(path)||/\/(?:berita|news|artikel|post|read)\//.test(path)||path.split('/').filter(Boolean).length>=2;
  }catch{return false}
}
function validArticleItem(item:OnlineArticle){return likelyArticlePath(item.url)}
function articleOnly(items:OnlineArticle[]){return items.filter(validArticleItem)}

async function fetchText(url:string,timeoutMs=8000){
  const response=await fetch(url,{headers:{
    'user-agent':USER_AGENT,
    accept:'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'id-ID,id;q=0.9,en;q=0.7',
    'cache-control':'no-cache',pragma:'no-cache',referer:'https://www.google.com/'
  },signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
  return {response,body:await response.text()};
}
function looksXml(type:string,body:string){return type.includes('xml')||/^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body)}
function parseFeed(xml:string,source:OnlineSource,scope?:OrganizationMediaScope|null):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item??root?.feed?.entry),out:OnlineArticle[]=[];
  for(const item of items){
    const title=firstString(item.title?.['#text'],item.title,item['media:title']);
    const url=firstString(item.link?.['@_href'],item.link,item.guid,item.id);
    const publishedAt=parseDate(firstString(item.pubDate,item.published,item.updated,item['dc:date']));
    if(!title||!url||!publishedAt)continue;
    const article={sourceId:source.id,title:title.trim(),url:url.trim(),publishedAt,excerpt:stripHtml(firstString(item['content:encoded'],item.content,item.description,item.summary))?.slice(0,100000)};
    if(validArticleItem(article))out.push(article);
  }
  return scopeOnly(freshOnly(out),scope).slice(0,80);
}
function googleNewsArticleId(url:string){try{const u=new URL(url);if(u.hostname!=='news.google.com')return null;const parts=u.pathname.split('/').filter(Boolean);const i=parts.indexOf('articles');return i>=0&&parts[i+1]?parts[i+1]:null}catch{return null}}
async function resolveGoogleNewsPublisherUrl(url:string){
  const id=googleNewsArticleId(url);if(!id){console.info({stage:'google_news_resolver',articleId:false,reason:'NO_ARTICLE_ID'},'online collector resolver diagnostic');return null}
  try{
    const {response,body}=await fetchText(`https://news.google.com/rss/articles/${encodeURIComponent(id)}`,10000);
    if(!response.ok){console.info({stage:'google_news_resolver',articleId:true,tokenPageStatus:response.status,reason:'TOKEN_PAGE_HTTP_ERROR'},'online collector resolver diagnostic');return null}
    const signature=body.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1];
    const timestamp=body.match(/data-n-a-ts=["']([^"']+)["']/i)?.[1];
    if(!signature||!timestamp){console.info({stage:'google_news_resolver',articleId:true,tokenPageStatus:response.status,signature:!!signature,timestamp:!!timestamp,reason:'TOKEN_MISSING'},'online collector resolver diagnostic');return null}
    const req=[[["Fbv4je",JSON.stringify(["garturlreq",[["X","X",["X","X"],null,null,1,1,"ID:id",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],id,Number(timestamp),signature]),null,"generic"]]];
    const rpc=await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','user-agent':USER_AGENT,referer:'https://news.google.com/'},body:`f.req=${encodeURIComponent(JSON.stringify(req))}`,signal:AbortSignal.timeout(10000)});
    if(!rpc.ok){console.info({stage:'google_news_resolver',articleId:true,signature:true,timestamp:true,rpcStatus:rpc.status,reason:'RPC_HTTP_ERROR'},'online collector resolver diagnostic');return null}
    const text=await rpc.text();
    const cleaned=text.trimStart().startsWith(")]}'")?text.trimStart().slice(4).trimStart():text.trim();
    let resolved:string|null=null;
    try{
      const envelope=JSON.parse(cleaned);
      const rows=Array.isArray(envelope)?envelope:[];
      for(const row of rows){
        if(!Array.isArray(row)||row[0]!=='wrb.fr'||row[1]!=='Fbv4je')continue;
        const payload=typeof row[2]==='string'?row[2]:JSON.stringify(row[2]??'');
        let decoded=payload;
        try{const nested=JSON.parse(payload);decoded=typeof nested==='string'?nested:JSON.stringify(nested)}catch{}
        const urls=decoded.match(new RegExp('https?://[^"\\\\\\s]+','g'))??[];
        const candidate=urls.map(value=>value.replace(/\\\\u003d/g,'=').replace(/\\\\u0026/g,'&').replace(/\\\\\//g,'/')).find(value=>{try{new URL(value);return true}catch{return false}});
        if(candidate){resolved=candidate;break}
      }
    }catch{}
    console.info({stage:'google_news_resolver',articleId:true,signature:true,timestamp:true,rpcStatus:rpc.status,wrbFr:true,resolved:!!resolved},'online collector resolver diagnostic');
    return resolved;
  }catch(error){console.info({stage:'google_news_resolver',reason:'EXCEPTION',error:error instanceof Error?error.message:String(error)},'online collector resolver diagnostic');return null}
}
async function resolveGoogleNewsCandidates(items:OnlineArticle[],targetUrl:string){
  const out:OnlineArticle[]=[];
  for(const item of items){
    if(samePublisherDomain(item.url,targetUrl)){out.push(item);continue}
    const resolved=await resolveGoogleNewsPublisherUrl(item.url);
    if(resolved&&samePublisherDomain(resolved,targetUrl))out.push({...item,url:resolved});else out.push(item);
  }
  return out;
}
function parseGoogleNewsFeed(xml:string,source:OnlineSource,scope?:OrganizationMediaScope|null):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item),out:OnlineArticle[]=[];
  const outletSuffix=new RegExp(`\\s+-\\s+${escapeRegExp(source.name)}\\s*$`,'i');
  for(const item of items){
    let title=firstString(item.title?.['#text'],item.title);
    const url=firstString(item.link,item.guid);
    const publishedAt=parseDate(firstString(item.pubDate));
    if(!title||!url||!publishedAt)continue;
    title=title.replace(outletSuffix,'').trim();
    const rawDescription=firstString(item.description)||'';
    const excerpt=stripHtml(rawDescription)?.slice(0,100000);
    const domain=publisherDomain(source.url);
    const descriptionHrefs=[...rawDescription.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/gi,'&'));
    const publisherUrl=descriptionHrefs.find(href=>publisherDomain(href)===domain);
    out.push({sourceId:source.id,title,url:publisherUrl||url,publishedAt,excerpt});
  }
  return scopeOnly(freshOnly(out),scope).filter(item=>item.title.length>=5).slice(0,50);
}
function discoverFeed(html:string,baseUrl:string){
  for(const tag of html.match(/<link\b[^>]*>/gi)??[]){
    const rel=tag.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase()??'';
    const type=tag.match(/type=["']([^"']+)["']/i)?.[1]?.toLowerCase()??'';
    const href=tag.match(/href=["']([^"']+)["']/i)?.[1];
    if(!href||!rel.includes('alternate')||(!type.includes('rss')&&!type.includes('atom')&&!type.includes('xml')))continue;
    try{return new URL(href,baseUrl).toString()}catch{}
  }
  return null;
}
function commonFeeds(baseUrl:string){try{const origin=new URL(baseUrl).origin;return [`${origin}/feed/`,`${origin}/feed`,`${origin}/rss`,`${origin}/rss/`,`${origin}/feed.xml`,`${origin}/index.xml`]}catch{return[]}}
async function tryFeeds(source:OnlineSource,urls:string[],scope?:OrganizationMediaScope|null){
  for(const url of [...new Set(urls.filter(Boolean))]){
    try{const {response,body}=await fetchText(url);if(!response.ok)continue;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!looksXml(type,body))continue;const items=parseFeed(body,source,scope);if(items.length){const verified=await verifyCandidates(items,scope);if(verified.length)return verified}}catch{}
  }
  return [] as OnlineArticle[];
}
async function tryExternalNewsFallback(source:OnlineSource,targetUrl:string,scope?:OrganizationMediaScope|null){
  const url=googleNewsUrl(source,targetUrl,scope);
  const diag={sourceId:source.id,source:source.name,publisherDomain:publisherDomain(targetUrl)||publisherDomain(source.url)};
  if(!url){console.info({...diag,stage:'google_news',reason:'NO_QUERY'},'online collector fallback diagnostic');return[] as OnlineArticle[]}
  try{
    const {response,body}=await fetchText(url,10000);
    if(!response.ok){console.info({...diag,stage:'google_news',httpStatus:response.status,reason:'RSS_HTTP_ERROR'},'online collector fallback diagnostic');return[]}
    const parsed=parseGoogleNewsFeed(body,source,scope);
    const candidates=await resolveGoogleNewsCandidates(parsed,targetUrl);
    const publisherResolved=candidates.filter(item=>samePublisherDomain(item.url,targetUrl)).length;
    console.info({...diag,stage:'google_news_candidates',candidates:candidates.length,publisherResolved},'online collector fallback diagnostic');
    if(!candidates.length)return[];
    const fallbackCandidates=candidates.map(item=>samePublisherDomain(item.url,targetUrl)?{...item,fallbackEvidence:'GOOGLE_NEWS_RSS' as const,expectedPublisherUrl:targetUrl}:item);
    const verified=await verifyCandidates(fallbackCandidates,scope);
    console.info({...diag,stage:'google_news_verified',candidates:candidates.length,publisherResolved,verified:verified.length},'online collector fallback diagnostic');
    return verified;
  }catch(error){console.info({...diag,stage:'google_news',reason:'EXCEPTION',error:error instanceof Error?error.message:String(error)},'online collector fallback diagnostic');return[]}
}
function meta(html:string,key:string){const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,'i')];for(const p of patterns){const v=html.match(p)?.[1];if(v)return stripHtml(v)}return undefined}
function canonical(html:string,fallback:string){const href=html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];try{return href?new URL(href,fallback).toString():fallback}catch{return fallback}}
function jsonLdPublished(html:string){
  for(const block of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)??[]){
    const raw=block.replace(/^.*?>/s,'').replace(/<\/script>\s*$/i,'');
    try{
      const data=JSON.parse(raw);const stack:any[]=[data];
      while(stack.length){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue}if(!v||typeof v!=='object')continue;const d=firstString(v.datePublished,v.dateCreated);if(d)return d;stack.push(...Object.values(v));}
    }catch{}
  }
  return undefined;
}
function jsonLdArticleType(html:string){
  for(const block of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)??[]){
    const raw=block.replace(/^.*?>/s,'').replace(/<\/script>\s*$/i,'');
    try{
      const data=JSON.parse(raw);const stack:any[]=[data];
      while(stack.length){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue}if(!v||typeof v!=='object')continue;const type=String(v['@type']||'');if(/(?:NewsArticle|Article|ReportageNewsArticle)/i.test(type))return true;stack.push(...Object.values(v));}
    }catch{}
  }
  return false;
}
function pathScopeScore(path:string,scope?:OrganizationMediaScope|null){
  if(!scope)return 0;
  const terms=organizationScopeTerms(scope).strong.map(t=>t.replace(/\s+/g,'-'));
  const normalized=path.toLowerCase().replace(/_/g,'-');
  return terms.some(term=>normalized.includes(term))?4:0;
}
function articleLinks(html:string,baseUrl:string,scope?:OrganizationMediaScope|null){
  const base=new URL(baseUrl),domain=base.hostname.replace(/^www\./i,''),seen=new Set<string>(),out:Array<{url:string;text:string;score:number}>=[];
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){
    try{
      const u=new URL(m[1],baseUrl);if(u.hostname!==base.hostname||!/^https?:$/.test(u.protocol))continue;u.hash='';
      const text=stripHtml(m[2])??'';if(text.length<12)continue;
      const path=u.pathname.toLowerCase();
      if(path==='/'||/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(path)||!likelyArticlePath(u.toString(),domain))continue;
      const url=u.toString();if(seen.has(url))continue;seen.add(url);
      let score=0;if(/\/20\d{2}\//.test(path))score+=8;if(/\/berita\/\d+/.test(path))score+=10;if(/\/\d{4,}\//.test(path))score+=8;if(/berita|news|artikel|post/.test(path))score+=4;score+=pathScopeScore(path,scope);if(path.split('/').filter(Boolean).length>=3)score+=2;if(text.length>=30)score+=2;
      out.push({url,text,score});
    }catch{}
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,40);
}
function parseArticleHtml(html:string,url:string,linkText:string,source:OnlineSource,scope?:OrganizationMediaScope|null):OnlineArticle|null{
  const finalUrl=canonical(html,url);
  if(!likelyArticlePath(finalUrl))return null;
  const title=meta(html,'og:title')??stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])??stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])??linkText;
  if(!title||title.length<5)return null;
  const isAntara=/antaranews\.com$/i.test(sourceDomain(finalUrl));
  const publishedRaw=meta(html,'article:published_time')??meta(html,'og:published_time')??meta(html,'datePublished')??jsonLdPublished(html)??(!isAntara?html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]:undefined);
  const publishedAt=parseDate(publishedRaw);if(!publishedAt)return null;
  const articleHtml=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??'';
  if(!articleHtml&&!jsonLdArticleType(html))return null;
  const excerpt=(stripHtml(articleHtml)??meta(html,'description')??meta(html,'og:description')??'').slice(0,100000);
  if(excerpt.length<40)return null;
  const article={sourceId:source.id,title:title.slice(0,1000),url:finalUrl,publishedAt,excerpt};
  return isFresh(article)&&scopeOnly([article],scope).length===1?article:null;
}
async function crawlHtml(source:OnlineSource,html:string,pageUrl:string,scope?:OrganizationMediaScope|null){
  const links=articleLinks(html,pageUrl,scope);
  const verified=await verifyDiscoveredArticles(links.map(link=>({sourceId:source.id,title:link.text,url:link.url})),{concurrency:6,limit:80});
  const articles:OnlineArticle[]=verified.map(v=>({sourceId:source.id,title:v.title,url:v.url,publishedAt:v.publishedAt,excerpt:v.excerpt}));
  return scopeOnly(freshOnly(articleOnly(articles)),scope).sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,80);
}
function nextPageUrl(html:string,currentUrl:string,visited:Set<string>){
  const rel=html.match(/<a\b[^>]*rel=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]??html.match(/<link\b[^>]*rel=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if(rel){try{const u=new URL(decodeEntities(rel),currentUrl).toString();if(!visited.has(u))return u}catch{}}
  const candidates:Array<{url:string;n:number}>=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){try{const u=new URL(decodeEntities(m[1]),currentUrl);const text=(stripHtml(m[2])||'').trim();const q=Number(u.searchParams.get('page')||u.searchParams.get('p')||0);const pathNum=Number(u.pathname.match(/\/page\/(\d+)/i)?.[1]||0);const n=q||pathNum||(/^\d+$/.test(text)?Number(text):0);if(n>1&&!visited.has(u.toString()))candidates.push({url:u.toString(),n});}catch{}}
  return candidates.sort((a,b)=>a.n-b.n)[0]?.url??null;
}
async function crawlScopedPages(source:OnlineSource,firstHtml:string,firstUrl:string,scope?:OrganizationMediaScope|null){
  const visited=new Set<string>();const merged=new Map<string,OnlineArticle>();let html=firstHtml,url=firstUrl;
  for(let page=0;page<8;page++){
    visited.add(url);
    const links=articleLinks(html,url,scope);
    const crawled=await crawlHtml(source,html,url,scope);
    console.info({sourceId:source.id,source:source.name,stage:'scoped_page_discovery',page:page+1,pageUrl:url,articleLinks:links.length,verifiedHtml:crawled.length},'online collector scoped diagnostic');
    for(const item of crawled)if(!merged.has(item.url.toLowerCase()))merged.set(item.url.toLowerCase(),item);
    const next=nextPageUrl(html,url,visited);if(!next)break;
    try{const fetched=await fetchText(next,8000);if(!fetched.response.ok)break;html=fetched.body;url=fetched.response.url||next;}catch{break}
  }
  return scopeOnly([...merged.values()],scope).sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,120);
}
function isScopedPage(url:string){try{const path=new URL(url).pathname.replace(/\/+$/,'');return path.length>0&&path!=='/'}catch{return false}}
export async function collectOnlineSource(source:OnlineSource,scope?:OrganizationMediaScope|null):Promise<OnlineArticle[]>{
  if(source.active===false)return[];
  const targetUrl=normalizeSourceUrl(source);
  let homepageError:Error|null=null;
  try{
    const {response,body}=await fetchText(targetUrl);
    if(response.ok){
      const pageUrl=response.url||targetUrl,type=response.headers.get('content-type')?.toLowerCase()??'';
      if(looksXml(type,body)){const candidates=parseFeed(body,source,scope);if(candidates.length){const items=await verifyCandidates(candidates,scope);if(items.length)return items}}
      if(isScopedPage(pageUrl)){
        const html=await crawlScopedPages(source,body,pageUrl,scope);if(html.length)return html;
        const discovered=discoverFeed(body,pageUrl);if(discovered){const items=await tryFeeds(source,[discovered],scope);if(items.length)return items}
      }else{
        const feedUrls=[discoverFeed(body,pageUrl)??'',...commonFeeds(pageUrl)];
        const [feeds,html]=await Promise.all([tryFeeds(source,feedUrls,scope),crawlHtml(source,body,pageUrl,scope)]);
        const merged=new Map<string,OnlineArticle>();
        for(const item of [...feeds,...html])if(!merged.has(item.url.toLowerCase()))merged.set(item.url.toLowerCase(),item);
        const combined=[...merged.values()].sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,120);
        if(combined.length)return combined;
      }
      homepageError=new Error(`Media ${source.name} tidak menghasilkan artikel relevan 7 hari terakhir dari scope organisasi aktif`);
    }else homepageError=new Error(`Media ${source.name} returned HTTP ${response.status}`);
  }catch(error){homepageError=error instanceof Error?error:new Error(String(error))}

  console.info({sourceId:source.id,source:source.name,targetUrl,homepageError:homepageError?.message??null,stage:'fallback_start'},'online collector fallback diagnostic');
  const directFeedFallback=await tryFeeds(source,commonFeeds(targetUrl),scope);console.info({sourceId:source.id,source:source.name,stage:'direct_feed_fallback',verified:directFeedFallback.length},'online collector fallback diagnostic');if(directFeedFallback.length)return directFeedFallback;
  const newsFallback=await tryExternalNewsFallback(source,targetUrl,scope);if(newsFallback.length)return newsFallback;
  throw homepageError??new Error(`Media ${source.name} tidak menghasilkan artikel relevan dalam 7 hari terakhir`);
}
