export type ArticleDateEvidence = 'META_ARTICLE_PUBLISHED' | 'META_OG_PUBLISHED' | 'META_DATE_PUBLISHED' | 'JSON_LD' | 'HTML_TIME' | 'VISIBLE_PUBLISHED' | 'GOOGLE_NEWS_RSS';

export type VerifiedOnlineArticle = {
  title: string;
  url: string;
  publishedAt: Date;
  publishedAtEvidence: ArticleDateEvidence;
  excerpt: string;
};

const ID_MONTHS:Record<string,number>={januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11};
const DAY='(?:Senin|Selasa|Rabu|Kamis|Jumat|Jum\\x27at|Sabtu|Minggu)';
const MONTH='(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)';
const VISIBLE_DATE_RE=new RegExp(`(?:${DAY}\\s*,?\\s*)?\\d{1,2}\\s+${MONTH}\\s+20\\d{2}\\s+\\d{1,2}[.:]\\d{2}(?::\\d{2})?\\s+(?:WIB|WITA|WIT)`,'i');

function decode(value:string){return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function text(value?:string){return value?decode(value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim():'';}
function first(...values:Array<string|undefined>){return values.find(v=>v?.trim())?.trim();}
function meta(html:string,key:string){for(const p of [new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,'i')]){const v=p.exec(html)?.[1];if(v)return decode(v).trim();}return undefined;}
function parseDate(value?:string){if(!value)return null;const direct=new Date(value);if(!Number.isNaN(direct.getTime()))return direct;const n=value.toLowerCase().replace(/\b(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\b\s*,?/g,' ').replace(/\s+/g,' ').trim();const m=n.match(/(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})(?:[^\d]+(\d{1,2})[.:](\d{2})(?::(\d{2}))?)?\s*(wib|wita|wit)?/i);if(!m)return null;const zone=(m[7]||'wib').toLowerCase();const offset=zone==='wit'?9:zone==='wita'?8:7;return new Date(Date.UTC(Number(m[3]),ID_MONTHS[m[2]],Number(m[1]),Number(m[4]||0)-offset,Number(m[5]||0),Number(m[6]||0)));}
function jsonLdDate(html:string){for(const block of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)??[]){try{const raw=block.replace(/^.*?>/s,'').replace(/<\/script>\s*$/i,'');const stack:any[]=[JSON.parse(raw)];while(stack.length){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue;}if(!v||typeof v!=='object')continue;const d=first(v.datePublished,v.dateCreated);if(d)return d;stack.push(...Object.values(v));}}catch{}}return undefined;}
function canonical(html:string,fallback:string){const href=html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];try{return href?new URL(href,fallback).toString():fallback;}catch{return fallback;}}
function isAntara(url:string){try{return /(?:^|\.)antaranews\.com$/i.test(new URL(url).hostname.replace(/^www\./i,''));}catch{return false;}}
function visiblePublicationDate(html:string,title:string){const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??html;const plain=text(article);const titlePos=plain.toLowerCase().indexOf(title.toLowerCase());const search=titlePos>=0?plain.slice(titlePos,titlePos+2500):plain.slice(0,3500);return search.match(VISIBLE_DATE_RE)?.[0];}
function dateEvidence(html:string,url:string,title:string):{raw:string;evidence:ArticleDateEvidence}|null{const options:Array<[string|undefined,ArticleDateEvidence]>=[[meta(html,'article:published_time'),'META_ARTICLE_PUBLISHED'],[meta(html,'og:published_time'),'META_OG_PUBLISHED'],[meta(html,'datePublished'),'META_DATE_PUBLISHED'],[jsonLdDate(html),'JSON_LD'],[html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],'HTML_TIME']];for(const [raw,evidence] of options)if(raw&&parseDate(raw))return{raw,evidence};const visible=visiblePublicationDate(html,title);if(visible&&parseDate(visible))return{raw:visible,evidence:'VISIBLE_PUBLISHED'};return null;}
function cleanArticleBody(html:string,title:string,url:string){let body=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??'';body=body.replace(/<(?:nav|aside|footer|figure)[\s\S]*?<\/(?:nav|aside|footer|figure)>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');let clean=text(body);if(!clean)clean=first(meta(html,'description'),meta(html,'og:description'))??'';const normalizedTitle=title.replace(/\s+/g,' ').trim();if(isAntara(url)){
  const titleEsc=normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const repeatedTitle=new RegExp(titleEsc,'ig');let match:RegExpExecArray|null,lastTitleEnd=-1;while((match=repeatedTitle.exec(clean)))lastTitleEnd=match.index+match[0].length;
  if(lastTitleEnd>=0){const after=clean.slice(lastTitleEnd).trim();const dm=after.match(VISIBLE_DATE_RE);if(dm&&dm.index!==undefined&&dm.index<120)clean=after.slice(dm.index+dm[0].length).trim();else clean=after;}
  clean=clean.replace(new RegExp(`^(?:${DAY}\\s*,?\\s*)?\\d{1,2}\\s+${MONTH}\\s+20\\d{2}\\s+\\d{1,2}[.:]\\d{2}(?::\\d{2})?\\s+(?:WIB|WITA|WIT)\\s*`,'i'),'').trim();
  clean=clean.replace(/^(?:[\p{L}][\p{L} .'-]{0,60},?\s*)?\(ANTARA(?:\/[^)]*)?\)\s*[-–—]\s*/iu,'').trim();
  const antaraBody=clean.search(/\b[\p{L}][\p{L} .'-]{1,60}\s*\(ANTARA\)\s*[-–—]\s*/iu);if(antaraBody>0)clean=clean.slice(antaraBody).trim();
 }else if(clean.startsWith(normalizedTitle))clean=clean.slice(normalizedTitle.length).trim();
 return clean.slice(0,100000);}

export function diagnoseOriginalArticleHtml(html:string,requestedUrl:string,linkTitle=''){
  const url=canonical(html,requestedUrl);
  const title=first(meta(html,'og:title'),text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),linkTitle);
  if(!title||title.length<5)return{reason:'MISSING_TITLE',url,htmlLength:html.length};
  const date=dateEvidence(html,url,title);
  if(!date)return{reason:'MISSING_DATE',url,htmlLength:html.length,hasArticlePublished:Boolean(meta(html,'article:published_time')),hasOgPublished:Boolean(meta(html,'og:published_time')),hasDatePublished:Boolean(meta(html,'datePublished')),hasTimeDatetime:/<time\b[^>]*datetime=["'][^"']+["']/i.test(html)};
  const publishedAt=parseDate(date.raw);
  if(!publishedAt)return{reason:'INVALID_DATE',url,dateEvidence:date.evidence,dateRaw:String(date.raw).slice(0,120),htmlLength:html.length};
  const excerpt=cleanArticleBody(html,title,url);
  if(excerpt.length<40)return{reason:'EXCERPT_TOO_SHORT',url,excerptLength:excerpt.length,hasArticleTag:/<article\b/i.test(html),hasMainTag:/<main\b/i.test(html),htmlLength:html.length,dateEvidence:date.evidence};
  return null;
}

export function verifyOriginalArticleHtml(html:string,requestedUrl:string,linkTitle=''):VerifiedOnlineArticle|null{
  const diagnostic=diagnoseOriginalArticleHtml(html,requestedUrl,linkTitle);if(diagnostic)return null;
  const url=canonical(html,requestedUrl);
  const title=first(meta(html,'og:title'),text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),linkTitle)!;
  const date=dateEvidence(html,url,title)!;
  const publishedAt=parseDate(date.raw)!;
  const excerpt=cleanArticleBody(html,title,url);
  return{title:title.slice(0,1000),url,publishedAt,publishedAtEvidence:date.evidence,excerpt};
}
