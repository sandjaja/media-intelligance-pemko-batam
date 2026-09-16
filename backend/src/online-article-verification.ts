export type ArticleDateEvidence = 'META_ARTICLE_PUBLISHED' | 'META_OG_PUBLISHED' | 'META_DATE_PUBLISHED' | 'JSON_LD' | 'HTML_TIME';

export type VerifiedOnlineArticle = {
  title: string;
  url: string;
  publishedAt: Date;
  publishedAtEvidence: ArticleDateEvidence;
  excerpt: string;
};

const ID_MONTHS:Record<string,number>={januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11};

function decode(value:string){return value.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&#x27;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function text(value?:string){return value?decode(value.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim():'';}
function first(...values:Array<string|undefined>){return values.find(v=>v?.trim())?.trim();}
function meta(html:string,key:string){for(const p of [new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,'i')]){const v=p.exec(html)?.[1];if(v)return decode(v).trim();}return undefined;}
function parseDate(value?:string){if(!value)return null;const direct=new Date(value);if(!Number.isNaN(direct.getTime()))return direct;const n=value.toLowerCase().replace(/\b(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu)\b\s*,?/g,' ').replace(/\s+/g,' ').trim();const m=n.match(/(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})(?:[^\d]+(\d{1,2})[.:](\d{2})(?::(\d{2}))?)?/i);if(!m)return null;return new Date(Date.UTC(Number(m[3]),ID_MONTHS[m[2]],Number(m[1]),Number(m[4]||0)-7,Number(m[5]||0),Number(m[6]||0)));}
function jsonLdDate(html:string){for(const block of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)??[]){try{const raw=block.replace(/^.*?>/s,'').replace(/<\/script>\s*$/i,'');const stack:any[]=[JSON.parse(raw)];while(stack.length){const v=stack.pop();if(Array.isArray(v)){stack.push(...v);continue;}if(!v||typeof v!=='object')continue;const d=first(v.datePublished,v.dateCreated);if(d)return d;stack.push(...Object.values(v));}}catch{}}return undefined;}
function canonical(html:string,fallback:string){const href=html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1];try{return href?new URL(href,fallback).toString():fallback;}catch{return fallback;}}
function dateEvidence(html:string):{raw:string;evidence:ArticleDateEvidence}|null{const options:Array<[string|undefined,ArticleDateEvidence]>=[[meta(html,'article:published_time'),'META_ARTICLE_PUBLISHED'],[meta(html,'og:published_time'),'META_OG_PUBLISHED'],[meta(html,'datePublished'),'META_DATE_PUBLISHED'],[jsonLdDate(html),'JSON_LD'],[html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1],'HTML_TIME']];for(const [raw,evidence] of options)if(raw&&parseDate(raw))return{raw,evidence};return null;}
function cleanArticleBody(html:string,title:string){let body=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]??html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]??'';body=body.replace(/<(?:nav|aside|footer|figure)[\s\S]*?<\/(?:nav|aside|footer|figure)>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ');let clean=text(body);if(!clean)clean=first(meta(html,'description'),meta(html,'og:description'))??'';const normalizedTitle=title.replace(/\s+/g,' ').trim();if(clean.startsWith(normalizedTitle))clean=clean.slice(normalizedTitle.length).trim();clean=clean.replace(/^(?:id\s+)?(?:[\p{L}\p{N} ._-]+,){2,}[\p{L}\p{N} ._-]+\s+(?=(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),?\s+\d{1,2}\s+)/iu,'');const datePrefix=/^(?:(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu),?\s+\d{1,2}\s+(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+20\d{2}\s+\d{1,2}[.:]\d{2}\s+WIB\s*)+/i;clean=clean.replace(datePrefix,'').trim();const bodyStart=clean.search(/\b(?:Batam|Tanjungpinang|Jakarta|Bintan|Karimun|Natuna|Lingga),?(?:\s*,?\s*(?:Kepri|Kepulauan Riau))?\s*\(ANTARA\)\s*-/i);if(bodyStart>0)clean=clean.slice(bodyStart).trim();return clean.slice(0,100000);}

export function verifyOriginalArticleHtml(html:string,requestedUrl:string,linkTitle=''):VerifiedOnlineArticle|null{
  const url=canonical(html,requestedUrl);
  const title=first(meta(html,'og:title'),text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),linkTitle);
  if(!title||title.length<5)return null;
  const date=dateEvidence(html);if(!date)return null;
  const publishedAt=parseDate(date.raw);if(!publishedAt)return null;
  const excerpt=cleanArticleBody(html,title);if(excerpt.length<40)return null;
  return{title:title.slice(0,1000),url,publishedAt,publishedAtEvidence:date.evidence,excerpt};
}
