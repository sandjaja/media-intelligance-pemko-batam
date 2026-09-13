import { XMLParser } from 'fast-xml-parser';

export type OnlineSource = { id:string; name:string; url:string; active?:boolean };
export type OnlineArticle = { sourceId:string; title:string; url:string; publishedAt:Date; excerpt?:string };

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_'});
const USER_AGENT='Mozilla/5.0 (compatible; PemkoBatamMediaIntelligence/2.1; +https://mediacenter.batam.go.id/)';
const asArray=<T>(v:T|T[]|undefined):T[]=>v==null?[]:Array.isArray(v)?v:[v];
const firstString=(...values:unknown[]):string|undefined=>values.find(v=>typeof v==='string'&&v.trim()) as string|undefined;
const parseDate=(value?:string)=>{const d=value?new Date(value):new Date();return Number.isNaN(d.getTime())?new Date():d};
const stripHtml=(value?:string)=>value?value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim():undefined;

function normalizeSourceUrl(source:OnlineSource){
  try{
    const u=new URL(source.url);
    // Batam Pos has moved its public news site to the Jawapos network.
    // The legacy batampos.co.id endpoint currently rejects the collector with HTTP 403,
    // while the public canonical site is batampos.jawapos.com.
    if(/(^|\.)batampos\.co\.id$/i.test(u.hostname)){
      return 'https://batampos.jawapos.com/';
    }
    return u.toString();
  }catch{return source.url}
}

async function fetchText(url:string,timeoutMs=8000){
  const response=await fetch(url,{headers:{
    'user-agent':USER_AGENT,
    accept:'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language':'id-ID,id;q=0.9,en;q=0.7',
    'cache-control':'no-cache',
    pragma:'no-cache',
    referer:'https://www.google.com/'
  },signal:AbortSignal.timeout(timeoutMs),redirect:'follow'});
  return {response,body:await response.text()};
}
function looksXml(type:string,body:string){return type.includes('xml')||/^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body)}
function parseFeed(xml:string,source:OnlineSource):OnlineArticle[]{
  const root=parser.parse(xml),items=asArray<any>(root?.rss?.channel?.item??root?.feed?.entry);
  return items.map((item:any)=>{
    const title=firstString(item.title?.['#text'],item.title,item['media:title']);
    const url=firstString(item.link?.['@_href'],item.link,item.guid,item.id);
    if(!title||!url)return null;
    return {sourceId:source.id,title:title.trim(),url:url.trim(),publishedAt:parseDate(firstString(item.pubDate,item.published,item.updated,item['dc:date'])),excerpt:stripHtml(firstString(item['content:encoded'],item.content,item.description,item.summary))?.slice(0,100000)};
  }).filter(Boolean).slice(0,80) as OnlineArticle[];
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
function commonFeeds(baseUrl:string){try{const origin=new URL(baseUrl).origin;return [`${origin}/feed/`,`${origin}/feed`,`${origin}/rss`,`${origin}/rss/`]}catch{return[]}}
async function tryFeeds(source:OnlineSource,urls:string[]){
  for(const url of [...new Set(urls.filter(Boolean))]){
    try{const {response,body}=await fetchText(url);if(!response.ok)continue;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!looksXml(type,body))continue;const items=parseFeed(body,source);if(items.length)return items}catch{}
  }
  return [] as OnlineArticle[];
}
function meta(html:string,key:string){
  const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,'i')];
  for(const p of patterns){const v=html.match(p)?.[1];if(v)return stripHtml(v)}
  return undefined;
}
function canonical(html:string,fallback:string){const href=html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];try{return href?new URL(href,fallback).toString():fallback}catch{return fallback}}
function articleLinks(html:string,baseUrl:string){
  const base=new URL(baseUrl),seen=new Set<string>(),out:Array<{url:string;text:string;score:number}>=[];
  const re=/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m:RegExpExecArray|null;
  while((m=re.exec(html))){try{const u=new URL(m[1],baseUrl);if(u.hostname!==base.hostname||!/^https?:$/.test(u.protocol))continue;u.hash='';const text=stripHtml(m[2])??'';if(text.length<12)continue;const path=u.pathname.toLowerCase();if(path==='/'||/\/(tag|author|wp-admin|wp-content|feed|category)(\/|$)/.test(path)||/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(path))continue;const url=u.toString();if(seen.has(url))continue;seen.add(url);let score=0;if(/\/20\d{2}\//.test(path))score+=8;if(/berita|news|artikel|post|batam|kepri|ekbis|nasional|hukum/.test(path))score+=4;if(path.split('/').filter(Boolean).length>=2)score+=2;if(text.length>=30)score+=2;out.push({url,text,score})}catch{}}
  return out.sort((a,b)=>b.score-a.score).slice(0,30);
}
function parseArticleHtml(html:string,url:string,linkText:string,source:OnlineSource):OnlineArticle|null{
  const title=meta(html,'og:title')??stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])??stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])??linkText;
  if(!title||title.length<5)return null;
  const publishedAt=parseDate(meta(html,'article:published_time')??html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]);
  const articleHtml=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??'';
  const excerpt=(stripHtml(articleHtml)??meta(html,'description')??meta(html,'og:description')??'').slice(0,100000);
  if(excerpt.length<40)return null;
  return {sourceId:source.id,title:title.slice(0,1000),url:canonical(html,url),publishedAt,excerpt};
}
async function crawlHtml(source:OnlineSource,html:string,pageUrl:string){
  const settled=await Promise.allSettled(articleLinks(html,pageUrl).map(async link=>{const {response,body}=await fetchText(link.url,6500);if(!response.ok)return null;const type=response.headers.get('content-type')?.toLowerCase()??'';if(!type.includes('text/html'))return null;return parseArticleHtml(body,response.url||link.url,link.text,source)}));
  const map=new Map<string,OnlineArticle>();for(const r of settled){if(r.status==='fulfilled'&&r.value&&!map.has(r.value.url.toLowerCase()))map.set(r.value.url.toLowerCase(),r.value)}return[...map.values()].sort((a,b)=>b.publishedAt.getTime()-a.publishedAt.getTime()).slice(0,80);
}
export async function collectOnlineSource(source:OnlineSource):Promise<OnlineArticle[]>{
  if(source.active===false)return[];
  const targetUrl=normalizeSourceUrl(source);
  let homepageError:Error|null=null;
  try{
    const {response,body}=await fetchText(targetUrl);
    if(response.ok){
      const pageUrl=response.url||targetUrl,type=response.headers.get('content-type')?.toLowerCase()??'';
      if(looksXml(type,body))return parseFeed(body,source);
      const feeds=await tryFeeds(source,[discoverFeed(body,pageUrl)??'',...commonFeeds(pageUrl)]);
      if(feeds.length)return feeds;
      const html=await crawlHtml(source,body,pageUrl);
      if(html.length)return html;
      throw new Error(`Media ${source.name} tidak menghasilkan artikel dari RSS/Atom maupun HTML`)
    }
    homepageError=new Error(`Media ${source.name} returned HTTP ${response.status}`);
  }catch(error){homepageError=error instanceof Error?error:new Error(String(error))}
  const fallback=await tryFeeds(source,commonFeeds(targetUrl));if(fallback.length)return fallback;
  throw homepageError??new Error(`Media ${source.name} tidak dapat diambil`);
}
