import { XMLParser } from 'fast-xml-parser';

export type OnlineSource = { id:string; name:string; url:string; active?:boolean };
export type OnlineArticle = { sourceId:string; title:string; url:string; publishedAt:Date; excerpt?:string };

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_'});
const USER_AGENT='Mozilla/5.0 (compatible; PemkoBatamMediaIntelligence/2.7; +https://mediacenter.batam.go.id/)';
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

function normalizeSourceUrl(source:OnlineSource){
  try{
    const u=new URL(source.url);
    if(/(^|\.)batampos\.co\.id$/i.test(u.hostname))return 'https://batampos.jawapos.com/batam';
    return u.toString();
  }catch{return source.url}
}
function sourceDomain(url:string){try{return new URL(url).hostname.replace(/^www\./i,'')}catch{return''}}
function sourceContext(source:OnlineSource){
  const terms:string[]=['Batam'];
  try{
    const path=new URL(source.url).pathname.toLowerCase();
    if(/pemko[-_]?batam|pemkobatam/.test(path))terms.unshift('Pemko Batam');
    else if(/bp[-_]?batam|bpbatam/.test(path))terms.unshift('BP Batam');
    else if(/kota[-_]?batam|kotabatam/.test(path))terms.unshift('Kota Batam');
    else {
      const meaningful=path.split('/').filter(Boolean).filter(x=>x.length>=4&&!/^(news|berita|artikel|index|home|tag|topic|category|kategori)$/.test(x)).slice(0,2);
      if(meaningful.length)terms.unshift(...meaningful.map(x=>x.replace(/[-_]+/g,' ')));
    }
  }catch{}
  return [...new Set(terms)].join(' ');
}
function googleNewsUrl(source:OnlineSource,targetUrl:string){
  const domain=sourceDomain(targetUrl)||sourceDomain(source.url);
  if(!domain)return null;
  const context=sourceContext(source);
  const q=encodeURIComponent(`site:${domain} ${context}`);
  return `https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`;
}

function configuredScopeSlug(source:OnlineSource){
  try{
    const path=new URL(source.url).pathname.toLowerCase().replace(/\/+$/,'');
    const parts=path.split('/').filter(Boolean);
    if(!parts.length)return'';
    return parts[parts.length-1].replace(/[-_]+/g,' ');
  }catch{return''}
}
const BATAM_SIGNALS=[
  'batam','barelang','bp batam','pemko batam','pemerintah kota batam','hang nadim','batu ampar','batu aji','batuaji','belakang padang','bengkong','bulang','galang','lubuk baja','nongsa','sagulung','sei beduk','sekupang','batam kota','tembesi','tanjung riau','tanjungriau'
];
const OUTSIDE_BATAM_SIGNALS=[
  'karimun','kundur','natuna','bintan','tanjungpinang','tanjung pinang','lingga','anambas','penyengat','daik','dabo singkep'
];
function sourceRequiresBatamScope(source:OnlineSource){
  try{
    const u=new URL(source.url);
    return /batam/i.test(`${u.pathname} ${source.name}`);
  }catch{return /batam/i.test(source.name)}
}
function scopeMatches(source:OnlineSource,item:OnlineArticle,html?:string){
  if(!sourceRequiresBatamScope(source))return true;
  const title=item.title.toLowerCase();
  const lead=String(item.excerpt||'').slice(0,1200).toLowerCase();
  const combined=`${title} ${lead}`;
  const titleHasBatam=BATAM_SIGNALS.some(term=>title.includes(term));
  const bodyHasBatam=BATAM_SIGNALS.some(term=>lead.includes(term));
  const titleHasOutside=OUTSIDE_BATAM_SIGNALS.some(term=>title.includes(term));
  if(titleHasOutside&&!titleHasBatam&&!bodyHasBatam)return false;
  if(titleHasBatam||bodyHasBatam)return true;
  if(html){
    const lower=html.toLowerCase();
    const slug=configuredScopeSlug(source).replace(/\s+/g,'[-_ ]+');
    const exactScope=!!slug&&new RegExp(`(?:tag|topic|category|kategori)[^\"']{0,160}${slug}`,'i').test(lower);
    if(exactScope&&BATAM_SIGNALS.some(term=>combined.includes(term)))return true;
  }
  return false;
}
function scopedOnly(source:OnlineSource,items:OnlineArticle[]){return items.filter(item=>scopeMatches(source,item))}

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
function parseFeed(xml:string,source:OnlineSource):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item??root?.feed?.entry),out:OnlineArticle[]=[];
  for(const item of items){
    const title=firstString(item.title?.['#text'],item.title,item['media:title']);
    const url=firstString(item.link?.['@_href'],item.link,item.guid,item.id);
    const publishedAt=parseDate(firstString(item.pubDate,item.published,item.updated,item['dc:date']));
    if(!title||!url||!publishedAt)continue;
    const article={sourceId:source.id,title:title.trim(),url:url.trim(),publishedAt,excerpt:stripHtml(firstString(item['content:encoded'],item.content,item.description,item.summary))?.slice(0,100000)};
    if(validArticleItem(article))out.push(article);
  }
  return scopedOnly(source,freshOnly(out)).slice(0,80);
}
function parseGoogleNewsFeed(xml:string,source:OnlineSource):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item),out:OnlineArticle[]=[];
  const outletSuffix=new RegExp(`\\s+-\\s+${escapeRegExp(source.name)}\\s*$`,'i');
  for(const item of items){
    let title=firstString(item.title?.['#text'],item.title);
    const url=firstString(item.link,item.guid);
    const publishedAt=parseDate(firstString(item.pubDate));
    if(!title||!url||!publishedAt)continue;
    title=title.replace(outletSuffix,'').replace(/\s+-\s+Jawa\s+Pos\s*$/i,'').trim();
    const excerpt=stripHtml(firstString(item.description))?.slice(0,100000);
    out.push({sourceId:source.id,title,url,publishedAt,excerpt});
  }
  return scopedOnly(source,freshOnly(out)).filter(item=>item.title.length>=5).slice(0,50);
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
async function tryFeeds(source:OnlineSource,urls:string[]){
  for(const url of [...new Set(urls.filter(Boolean))]){
    try{const {response,body}=await fetchText(url);if(!response.ok)continue;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!looksXml(type,body))continue;const items=parseFeed(body,source);if(items.length)return items}catch{}
  }
  return [] as OnlineArticle[];
}
async function tryExternalNewsFallback(source:OnlineSource,targetUrl:string){
  const url=googleNewsUrl(source,targetUrl);
  if(!url)return[] as OnlineArticle[];
  try{
    const {response,body}=await fetchText(url,10000);
    if(!response.ok)return[];
    return parseGoogleNewsFeed(body,source);
  }catch{return[]}
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
function articleLinks(html:string,baseUrl:string){
  const base=new URL(baseUrl),domain=base.hostname.replace(/^www\./i,''),seen=new Set<string>(),out:Array<{url:string;text:string;score:number}>=[];
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){
    try{
      const u=new URL(m[1],baseUrl);if(u.hostname!==base.hostname||!/^https?:$/.test(u.protocol))continue;u.hash='';
      const text=stripHtml(m[2])??'';if(text.length<12)continue;
      const path=u.pathname.toLowerCase();
      if(path==='/'||/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(path)||!likelyArticlePath(u.toString(),domain))continue;
      const url=u.toString();if(seen.has(url))continue;seen.add(url);
      let score=0;if(/\/20\d{2}\//.test(path))score+=8;if(/\/berita\/\d+/.test(path))score+=10;if(/\/\d{4,}\//.test(path))score+=8;if(/berita|news|artikel|post|batam|pemko|kota-batam/.test(path))score+=4;if(path.split('/').filter(Boolean).length>=3)score+=2;if(text.length>=30)score+=2;
      out.push({url,text,score});
    }catch{}
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,40);
}
function parseArticleHtml(html:string,url:string,linkText:string,source:OnlineSource):OnlineArticle|null{
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
  return isFresh(article)&&scopeMatches(source,article,html)?article:null;
}
async function crawlHtml(source:OnlineSource,html:string,pageUrl:string){
  const settled=await Promise.allSettled(articleLinks(html,pageUrl).map(async link=>{const {response,body}=await fetchText(link.url,6500);if(!response.ok)return null;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!type.includes('text/html'))return null;return parseArticleHtml(body,response.url||link.url,link.text,source)}));
  const map=new Map<string,OnlineArticle>();for(const r of settled){if(r.status==='fulfilled'&&r.value&&!map.has(r.value.url.toLowerCase()))map.set(r.value.url.toLowerCase(),r.value)}
  return freshOnly(articleOnly([...map.values()])).sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,80);
}
function nextPageUrl(html:string,currentUrl:string,visited:Set<string>){
  const rel=html.match(/<a\b[^>]*rel=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]??html.match(/<link\b[^>]*rel=["'][^"']*next[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if(rel){try{const u=new URL(rel,currentUrl).toString();if(!visited.has(u))return u}catch{}}
  const candidates:Array<{url:string;n:number}>=[];const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){try{const u=new URL(m[1],currentUrl);const text=(stripHtml(m[2])||'').trim();const q=Number(u.searchParams.get('page')||u.searchParams.get('p')||0);const pathNum=Number(u.pathname.match(/\/page\/(\d+)/i)?.[1]||0);const n=q||pathNum||(/^\d+$/.test(text)?Number(text):0);if(n>1&&!visited.has(u.toString()))candidates.push({url:u.toString(),n});}catch{}}
  return candidates.sort((a,b)=>a.n-b.n)[0]?.url??null;
}
async function crawlScopedPages(source:OnlineSource,firstHtml:string,firstUrl:string){
  const visited=new Set<string>();const merged=new Map<string,OnlineArticle>();let html=firstHtml,url=firstUrl;
  for(let page=0;page<8;page++){
    visited.add(url);
    for(const item of await crawlHtml(source,html,url))if(!merged.has(item.url.toLowerCase()))merged.set(item.url.toLowerCase(),item);
    const next=nextPageUrl(html,url,visited);if(!next)break;
    try{const fetched=await fetchText(next,8000);if(!fetched.response.ok)break;html=fetched.body;url=fetched.response.url||next;}catch{break}
  }
  return [...merged.values()].sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,120);
}
function isScopedPage(url:string){try{const path=new URL(url).pathname.replace(/\/+$/,'');return path.length>0&&path!=='/'}catch{return false}}
export async function collectOnlineSource(source:OnlineSource):Promise<OnlineArticle[]>{
  if(source.active===false)return[];
  const targetUrl=normalizeSourceUrl(source);
  let homepageError:Error|null=null;
  try{
    const {response,body}=await fetchText(targetUrl);
    if(response.ok){
      const pageUrl=response.url||targetUrl,type=response.headers.get('content-type')?.toLowerCase()??'';
      if(looksXml(type,body)){const items=parseFeed(body,source);if(items.length)return items}
      if(isScopedPage(pageUrl)){
        const html=await crawlScopedPages(source,body,pageUrl);if(html.length)return html;
        const discovered=discoverFeed(body,pageUrl);if(discovered){const items=await tryFeeds(source,[discovered]);if(items.length)return items}
      }else{
        const feeds=await tryFeeds(source,[discoverFeed(body,pageUrl)??'',...commonFeeds(pageUrl)]);if(feeds.length)return feeds;
        const html=await crawlHtml(source,body,pageUrl);if(html.length)return html;
      }
      homepageError=new Error(`Media ${source.name} tidak menghasilkan artikel relevan 7 hari terakhir dari scope sumber`);
    }else homepageError=new Error(`Media ${source.name} returned HTTP ${response.status}`);
  }catch(error){homepageError=error instanceof Error?error:new Error(String(error))}

  const directFeedFallback=await tryFeeds(source,commonFeeds(targetUrl));if(directFeedFallback.length)return directFeedFallback;
  const newsFallback=await tryExternalNewsFallback(source,targetUrl);if(newsFallback.length)return newsFallback;
  throw homepageError??new Error(`Media ${source.name} tidak menghasilkan artikel relevan dalam 7 hari terakhir`);
}
