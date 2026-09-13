import { XMLParser } from 'fast-xml-parser';

export type OnlineSource = { id:string; name:string; url:string; active?:boolean };
export type OnlineArticle = { sourceId:string; title:string; url:string; publishedAt:Date; excerpt?:string };

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_'});
const USER_AGENT='Mozilla/5.0 (compatible; PemkoBatamMediaIntelligence/2.4; +https://mediacenter.batam.go.id/)';
const MAX_ARTICLE_AGE_MS=7*24*60*60*1000;
const FUTURE_TOLERANCE_MS=60*60*1000;
const asArray=<T>(v:T|T[]|undefined):T[]=>v==null?[]:Array.isArray(v)?v:[v];
const firstString=(...values:unknown[]):string|undefined=>values.find(v=>typeof v==='string'&&v.trim()) as string|undefined;
const parseDate=(value?:string)=>{const d=value?new Date(value):new Date();return Number.isNaN(d.getTime())?new Date():d};
const stripHtml=(value?:string)=>value?value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim():undefined;
const escapeRegExp=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function isFresh(article:OnlineArticle,now=Date.now()){const t=article.publishedAt.getTime();return Number.isFinite(t)&&t>=now-MAX_ARTICLE_AGE_MS&&t<=now+FUTURE_TOLERANCE_MS}
function freshOnly(items:OnlineArticle[]){const now=Date.now();return items.filter(item=>isFresh(item,now))}

function normalizeSourceUrl(source:OnlineSource){
  try{
    const u=new URL(source.url);
    // Known canonical relocation: legacy Batam Pos blocks automated requests.
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
      const meaningful=path.split('/').filter(Boolean).filter(x=>x.length>=4&&!/^(news|berita|artikel|index|home|tag|category|kategori)$/.test(x)).slice(0,2);
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
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item??root?.feed?.entry);
  const out=items.map((item:any)=>{
    const title=firstString(item.title?.['#text'],item.title,item['media:title']);
    const url=firstString(item.link?.['@_href'],item.link,item.guid,item.id);
    if(!title||!url)return null;
    return {sourceId:source.id,title:title.trim(),url:url.trim(),publishedAt:parseDate(firstString(item.pubDate,item.published,item.updated,item['dc:date'])),excerpt:stripHtml(firstString(item['content:encoded'],item.content,item.description,item.summary))?.slice(0,100000)};
  }).filter(Boolean) as OnlineArticle[];
  return freshOnly(out).slice(0,80);
}
function parseGoogleNewsFeed(xml:string,source:OnlineSource):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item),out:OnlineArticle[]=[];
  const outletSuffix=new RegExp(`\\s+-\\s+${escapeRegExp(source.name)}\\s*$`,'i');
  for(const item of items){
    let title=firstString(item.title?.['#text'],item.title);
    const url=firstString(item.link,item.guid);
    if(!title||!url)continue;
    title=title.replace(outletSuffix,'').replace(/\s+-\s+Jawa\s+Pos\s*$/i,'').trim();
    const excerpt=stripHtml(firstString(item.description))?.slice(0,100000);
    out.push({sourceId:source.id,title,url,publishedAt:parseDate(firstString(item.pubDate)),excerpt});
  }
  return freshOnly(out).filter(item=>item.title.length>=5).slice(0,50);
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
function meta(html:string,key:string){const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,'i')];for(const p of patterns){const v=html.match(p)?.[1];if(v)return stripHtml(v)}return undefined}
function canonical(html:string,fallback:string){const href=html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];try{return href?new URL(href,fallback).toString():fallback}catch{return fallback}}
function articleLinks(html:string,baseUrl:string){
  const base=new URL(baseUrl),seen=new Set<string>(),out:Array<{url:string;text:string;score:number}>=[];
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){
    try{
      const u=new URL(m[1],baseUrl);if(u.hostname!==base.hostname||!/^https?:$/.test(u.protocol))continue;u.hash='';
      const text=stripHtml(m[2])??'';if(text.length<12)continue;
      const path=u.pathname.toLowerCase();
      if(path==='/'||/\/(tag|author|wp-admin|wp-content|feed|category)(\/|$)/.test(path)||/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(path))continue;
      const url=u.toString();if(seen.has(url))continue;seen.add(url);
      let score=0;if(/\/20\d{2}\//.test(path))score+=8;if(/berita|news|artikel|post|batam|kepri|ekbis|nasional|hukum/.test(path))score+=4;if(path.split('/').filter(Boolean).length>=2)score+=2;if(text.length>=30)score+=2;
      out.push({url,text,score});
    }catch{}
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,30);
}
function parseArticleHtml(html:string,url:string,linkText:string,source:OnlineSource):OnlineArticle|null{
  const title=meta(html,'og:title')??stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])??stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])??linkText;
  if(!title||title.length<5)return null;
  const publishedAt=parseDate(meta(html,'article:published_time')??html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]);
  const articleHtml=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??'';
  const excerpt=(stripHtml(articleHtml)??meta(html,'description')??meta(html,'og:description')??'').slice(0,100000);
  if(excerpt.length<40)return null;
  const article={sourceId:source.id,title:title.slice(0,1000),url:canonical(html,url),publishedAt,excerpt};
  return isFresh(article)?article:null;
}
async function crawlHtml(source:OnlineSource,html:string,pageUrl:string){
  const settled=await Promise.allSettled(articleLinks(html,pageUrl).map(async link=>{const {response,body}=await fetchText(link.url,6500);if(!response.ok)return null;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!type.includes('text/html'))return null;return parseArticleHtml(body,response.url||link.url,link.text,source)}));
  const map=new Map<string,OnlineArticle>();for(const r of settled){if(r.status==='fulfilled'&&r.value&&!map.has(r.value.url.toLowerCase()))map.set(r.value.url.toLowerCase(),r.value)}
  return freshOnly([...map.values()]).sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,80);
}
export async function collectOnlineSource(source:OnlineSource):Promise<OnlineArticle[]>{
  if(source.active===false)return[];
  const targetUrl=normalizeSourceUrl(source);
  let homepageError:Error|null=null;
  try{
    const {response,body}=await fetchText(targetUrl);
    if(response.ok){
      const pageUrl=response.url||targetUrl,type=response.headers.get('content-type')?.toLowerCase()??'';
      if(looksXml(type,body)){const items=parseFeed(body,source);if(items.length)return items}
      const feeds=await tryFeeds(source,[discoverFeed(body,pageUrl)??'',...commonFeeds(pageUrl)]);if(feeds.length)return feeds;
      const html=await crawlHtml(source,body,pageUrl);if(html.length)return html;
      homepageError=new Error(`Media ${source.name} tidak menghasilkan artikel 7 hari terakhir dari RSS/Atom maupun HTML`);
    }else homepageError=new Error(`Media ${source.name} returned HTTP ${response.status}`);
  }catch(error){homepageError=error instanceof Error?error:new Error(String(error))}

  const directFeedFallback=await tryFeeds(source,commonFeeds(targetUrl));if(directFeedFallback.length)return directFeedFallback;

  // Universal fallback for any online source that blocks crawling, lacks RSS, or changes markup.
  const newsFallback=await tryExternalNewsFallback(source,targetUrl);if(newsFallback.length)return newsFallback;

  throw homepageError??new Error(`Media ${source.name} tidak menghasilkan artikel dalam 7 hari terakhir`);
}
