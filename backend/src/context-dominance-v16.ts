import type { Pool } from 'pg';

function normalize(value:string){return String(value||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}
const CONTEXT_STOP=new Set(['dan','atau','yang','dengan','untuk','dalam','serta','pemerintah','pemerintahan','daerah','masyarakat','kota','kabupaten']);
function rawTokens(value:string){return normalize(value).split(/\s+/).filter(v=>v.length>=4);}
function tokens(value:string){return rawTokens(value).filter(v=>!CONTEXT_STOP.has(v));}
function tokenCoverage(text:string,keyword:string){const parts=tokens(keyword);if(parts.length<2)return 0;const hit=parts.filter(p=>containsPhrase(text,p)).length;return hit/parts.length;}
function firstLead(value:string){const text=String(value||'').replace(/\s+/g,' ').trim();const cut=text.search(/\b(?:baca juga|pewarta\s*:|editor\s*:|copyright\b|kategori\s+inovasi)\b/i);return (cut>=0?text.slice(0,cut):text).slice(0,900);}
function isShortKeyword(keyword:string){const n=normalize(keyword).replace(/\s+/g,'');return n.length<=3;}
function batamGovernmentContext(text:string){return /\b(?:pemkot batam|pemerintah kota batam|pemko batam)\b/.test(normalize(text));}
function governmentConceptContext(text:string,keyword:string){const raw=rawTokens(keyword),meaningful=tokens(keyword);if(raw.length<2||meaningful.length!==1)return false;const hasGovernmentQualifier=raw.some(t=>t==='pemerintah'||t==='pemerintahan'||t==='daerah'||t==='kota'||t==='kabupaten');return hasGovernmentQualifier&&containsPhrase(text,meaningful[0])&&batamGovernmentContext(text);}
function titleConceptCoverage(title:string,keyword:string){const meaningful=tokens(keyword);if(!meaningful.length)return 0;const hit=meaningful.filter(p=>containsPhrase(title,p)).length;return hit/meaningful.length;}
function sharedConcept(title:string,label:string){const titleTokens=new Set(tokens(title));const concept=tokens(label);const shared=concept.filter(t=>titleTokens.has(t));return shared.length>=2&&shared.length>=Math.min(2,concept.length);}
const OTHER_REGION=/\b(?:pekanbaru|riau|tanjungpinang|bintan|karimun|natuna|lingga|anambas|jakarta|medan|padang|jambi|palembang)\b/;
function titleDominatedByOtherRegion(title:string){const n=normalize(title),batam=n.indexOf('batam'),other=n.search(OTHER_REGION);return other>=0&&(batam<0||other<batam);}

// Polysemous infrastructure terms must be validated from the headline sentence first.
// Lead/body vocabulary must not rescue a clearly figurative headline use.
const BRIDGE_TITLE_PHYSICAL=/\b(?:jembatan\s+(?:jalan|penyeberangan|layang|beton|baja)|(?:bangun|membangun|dibangun|pembangunan|proyek|konstruksi|perbaikan|memperbaiki|diperbaiki|rehabilitasi|pemeliharaan|rusak|ambruk|roboh|retak|struktur|tiang|pondasi|akses|lalu lintas|kendaraan|flyover)\b[^.]{0,80}\bjembatan\b|\bjembatan\b[^.]{0,80}\b(?:dibangun|pembangunan|proyek|konstruksi|diperbaiki|perbaikan|rehabilitasi|pemeliharaan|rusak|ambruk|roboh|retak|struktur|tiang|pondasi|akses|lalu lintas|kendaraan))\b/;
const BRIDGE_TITLE_FIGURATIVE=/\b(?:jadi|menjadi|sebagai)\s+(?:sebuah\s+)?jembatan\b|\bjembatan\s+(?:antara\s+)?(?:masyarakat|komunikasi|aspirasi|silaturahmi|dialog|kolaborasi|kerja sama|kerjasama|kepentingan|pemerintah|warga|organisasi)\b/;
function rejectAutomaticPolysemousTitleUse(keyword:string,title:string){
 const k=normalize(keyword),headline=normalize(title);
 if(k!=='jembatan')return false;
 if(!containsPhrase(headline,'jembatan'))return false;
 if(BRIDGE_TITLE_PHYSICAL.test(headline))return false;
 return BRIDGE_TITLE_FIGURATIVE.test(headline);
}

export type V16HeadlineTaxonomy={id:string;name:string;matchSource?:'TAXONOMY_EXACT'|'TAXONOMY_CONCEPT'|'SECTOR_CONCEPT'};
export type V16PrimaryEvidence={opdId:string;keywordId:string;keyword:string;taxonomyId:string;taxonomyName:string;score:number;matchType:'MANUAL'|'TITLE_PHRASE'|'TITLE_CONCEPT_LEAD_PHRASE'|'LEAD_PHRASE'|'CONTEXTUAL';supportingOpdIds:string[]};
export type V16RoutingInput={title:string;summary?:string|null;content?:string|null;manualKeywordIds?:Array<string|number>};

export async function getV16HeadlineTaxonomies(pool:Pool,title:string):Promise<V16HeadlineTaxonomy[]>{
 const rows=(await pool.query(`SELECT tc.id,tc.name,cs.name sector_name FROM taxonomy_categories tc JOIN classification_sectors cs ON cs.id=tc.sector_id AND cs.active=true WHERE tc.active=true AND tc.organization_id=cs.organization_id ORDER BY length(tc.name) DESC,tc.id`)).rows;
 const out=new Map<string,V16HeadlineTaxonomy>();
 for(const r of rows){
  const id=String(r.id),name=String(r.name||''),sector=String(r.sector_name||'');
  if(containsPhrase(title,name)){out.set(id,{id,name,matchSource:'TAXONOMY_EXACT'});continue;}
  if(sharedConcept(title,name)){out.set(id,{id,name,matchSource:'TAXONOMY_CONCEPT'});continue;}
  if(sharedConcept(title,sector))out.set(id,{id,name,matchSource:'SECTOR_CONCEPT'});
 }
 return [...out.values()];
}

/** Shared V16.5 decision layer. It reads Master Classification but does not read/write articles. */
export async function getV16PrimaryEvidenceForInput(pool:Pool,input:V16RoutingInput):Promise<V16PrimaryEvidence|null>{
 const title=String(input.title||''),lead=firstLead(String(input.summary||input.content||'')),context=`${title} ${lead}`;
 const orgContext=await organizationContext(pool);
 const manualIds=new Set((input.manualKeywordIds??[]).map(id=>String(id)));
 const headlineTaxonomies=new Set((await getV16HeadlineTaxonomies(pool,title)).map(t=>t.id));
 const rows=(await pool.query(`SELECT k.id keyword_id,k.keyword,k.evidence_strength,kt.category_id taxonomy_id,tc.name taxonomy_name,kt.weight taxonomy_weight,ko.opd_id,ko.weight opd_weight,o.name opd_name,o.code opd_code FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories tc ON tc.id=kt.category_id AND tc.active=true JOIN classification_sectors cs ON cs.id=tc.sector_id AND cs.active=true JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true AND ko.routing_role='PRIMARY' JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE k.active=true AND k.organization_id IS NOT NULL AND k.opd_id IS NULL AND k.district_id IS NULL AND tc.organization_id=k.organization_id AND cs.organization_id=k.organization_id ORDER BY k.id`)).rows;
 const candidates:any[]=[];
 for(const r of rows){const keyword=String(r.keyword||''),manual=manualIds.has(String(r.keyword_id)),titlePhrase=containsPhrase(title,keyword),leadPhrase=containsPhrase(lead,keyword),titleConcept=titleConceptCoverage(title,keyword);let matchType:V16PrimaryEvidence['matchType']|null=null,position=0,dominanceBonus=0;
  const evidenceStrength=String(r.evidence_strength||'REVIEW');
  if(!manual&&evidenceStrength!=='DIRECT'&&!(evidenceStrength==='CONTEXT'&&titlePhrase))continue;
  // A figurative headline is authoritative for intent: unrelated words in the lead/body cannot
  // turn that same headline phrase back into physical-infrastructure evidence. Manual Humas
  // correction remains authoritative and bypasses this automatic guard.
  if(!manual&&rejectAutomaticPolysemousTitleUse(keyword,title))continue;
  if(manual){matchType='MANUAL';position=100;}else if(evidenceStrength==='CONTEXT'){matchType='TITLE_PHRASE';position=12;}else if(isShortKeyword(keyword)){if(titlePhrase){matchType='TITLE_PHRASE';position=12;}else continue;}else if(titlePhrase){matchType='TITLE_PHRASE';position=12;}else if(leadPhrase&&titleConcept===1&&organizationGovernmentContext(context,orgContext)){matchType='TITLE_CONCEPT_LEAD_PHRASE';position=12;dominanceBonus=50;}else if(leadPhrase){matchType='LEAD_PHRASE';position=6;}else{
   const meaningful=tokens(keyword),coverage=tokenCoverage(context,keyword);
   if((meaningful.length>=2&&coverage===1&&organizationGovernmentContext(context,orgContext))||governmentConceptContext(context,keyword,orgContext)){matchType='CONTEXTUAL';position=3;}
  }
  if(!matchType)continue;
  // Geographic relevance is enforced by the shared Organization Scope Filter before routing.
  // V16.5 therefore uses only the active organization's database-backed identity as positive context.
  if(!manual&&headlineTaxonomies.size>0&&!titlePhrase&&!headlineTaxonomies.has(String(r.taxonomy_id)))continue;
  const score=Number(r.taxonomy_weight||0)*position+Number(r.opd_weight||1)*position+dominanceBonus;candidates.push({...r,keyword,score,matchType,titleConcept});
 }
 const order=['MANUAL','TITLE_PHRASE','TITLE_CONCEPT_LEAD_PHRASE','LEAD_PHRASE','CONTEXTUAL'];
 candidates.sort((a,b)=>b.score-a.score||(order.indexOf(a.matchType)-order.indexOf(b.matchType))||Number(a.keyword_id)-Number(b.keyword_id));
 const best=candidates[0];if(!best)return null;
 const supporting=(await pool.query(`SELECT ko.opd_id FROM keyword_opd ko JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE ko.keyword_id=$1 AND ko.active=true AND ko.routing_role='SUPPORTING' ORDER BY ko.weight DESC,ko.opd_id LIMIT 3`,[best.keyword_id])).rows.map((r:any)=>String(r.opd_id));
 return{opdId:String(best.opd_id),keywordId:String(best.keyword_id),keyword:String(best.keyword),taxonomyId:String(best.taxonomy_id),taxonomyName:String(best.taxonomy_name),score:Number(best.score),matchType:best.matchType,supportingOpdIds:supporting};
}

export async function getV16PrimaryEvidence(pool:Pool,articleId:string):Promise<V16PrimaryEvidence|null>{
 const article=(await pool.query(`SELECT id,title,summary,content FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return null;
 const manualKeywordIds=(await pool.query(`SELECT keyword_id FROM article_manual_keywords WHERE article_id=$1 AND active=true`,[articleId])).rows.map((r:any)=>String(r.keyword_id));
 return getV16PrimaryEvidenceForInput(pool,{title:String(article.title||''),summary:article.summary,content:article.content,manualKeywordIds});
}
