import type { Pool } from 'pg';

function normalize(value:string){return String(value||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
function tokens(value:string){const stop=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','pemerintahan','daerah','masyarakat','kota','kabupaten']);return normalize(value).split(/\s+/).filter(v=>v.length>=4&&!stop.has(v));}
function tokenCoverage(text:string,keyword:string){const parts=tokens(keyword);if(parts.length<2)return 0;const hit=parts.filter(p=>containsPhrase(text,p)).length;return hit/parts.length;}
function firstLead(value:string){const text=String(value||'').replace(/\s+/g,' ').trim();const cut=text.search(/\b(?:baca juga|pewarta\s*:|editor\s*:|copyright\b|kategori\s+inovasi)\b/i);return (cut>=0?text.slice(0,cut):text).slice(0,900);}

export type V16PrimaryEvidence={opdId:string;keywordId:string;keyword:string;taxonomyId:string;taxonomyName:string;score:number;matchType:'MANUAL'|'TITLE_PHRASE'|'LEAD_PHRASE'|'CONTEXTUAL';supportingOpdIds:string[]};

export async function getV16PrimaryEvidence(pool:Pool,articleId:string):Promise<V16PrimaryEvidence|null>{
 const article=(await pool.query(`SELECT id,title,summary,content FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return null;
 const title=String(article.title||''),lead=firstLead(String(article.summary||article.content||''));
 const manualIds=new Set((await pool.query(`SELECT keyword_id FROM article_manual_keywords WHERE article_id=$1 AND active=true`,[articleId])).rows.map((r:any)=>String(r.keyword_id)));
 const rows=(await pool.query(`SELECT k.id keyword_id,k.keyword,kt.category_id taxonomy_id,tc.name taxonomy_name,kt.weight taxonomy_weight,ko.opd_id,ko.weight opd_weight FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories tc ON tc.id=kt.category_id AND tc.active=true JOIN classification_sectors cs ON cs.id=tc.sector_id AND cs.active=true JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true AND ko.routing_role='PRIMARY' WHERE k.active=true AND k.organization_id IS NOT NULL AND k.opd_id IS NULL AND k.district_id IS NULL AND tc.organization_id=k.organization_id AND cs.organization_id=k.organization_id ORDER BY k.id`)).rows;
 const candidates:any[]=[];
 for(const r of rows){const keyword=String(r.keyword||''),manual=manualIds.has(String(r.keyword_id)),titlePhrase=containsPhrase(title,keyword),leadPhrase=containsPhrase(lead,keyword);let matchType:V16PrimaryEvidence['matchType']|null=null,position=0;
  if(manual){matchType='MANUAL';position=100;}else if(titlePhrase){matchType='TITLE_PHRASE';position=12;}else if(leadPhrase){matchType='LEAD_PHRASE';position=6;}else{
   const coverage=tokenCoverage(`${title} ${lead}`,keyword),context=normalize(`${title} ${lead}`);
   // Contextual expansion is deliberately conservative: multi-token master concepts only,
   // with all meaningful concept tokens present and explicit Batam/Pemko-government context.
   if(tokens(keyword).length>=2&&coverage===1&&(/\b(pemkot batam|pemerintah kota batam|pemko batam|batam)\b/.test(context))){matchType='CONTEXTUAL';position=3;}
  }
  if(!matchType)continue;const score=Number(r.taxonomy_weight||0)*position+Number(r.opd_weight||1)*position;candidates.push({...r,keyword,score,matchType});
 }
 candidates.sort((a,b)=>b.score-a.score||(['MANUAL','TITLE_PHRASE','LEAD_PHRASE','CONTEXTUAL'].indexOf(a.matchType)-['MANUAL','TITLE_PHRASE','LEAD_PHRASE','CONTEXTUAL'].indexOf(b.matchType))||Number(a.keyword_id)-Number(b.keyword_id));
 const best=candidates[0];if(!best)return null;
 const supporting=(await pool.query(`SELECT ko.opd_id FROM keyword_opd ko JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE ko.keyword_id=$1 AND ko.active=true AND ko.routing_role='SUPPORTING' ORDER BY ko.weight DESC,ko.opd_id LIMIT 3`,[best.keyword_id])).rows.map((r:any)=>String(r.opd_id));
 return{opdId:String(best.opd_id),keywordId:String(best.keyword_id),keyword:String(best.keyword),taxonomyId:String(best.taxonomy_id),taxonomyName:String(best.taxonomy_name),score:Number(best.score),matchType:best.matchType,supportingOpdIds:supporting};
}
