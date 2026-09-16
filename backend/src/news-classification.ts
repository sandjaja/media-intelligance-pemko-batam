import type { Pool } from 'pg';

export type NewsClassification='UTAMA'|'PENDUKUNG';
export type NewsClassificationDecision={classification:NewsClassification;source:'AUTO'|'MANUAL';reason:string;signals:string[]};

function normalize(value:unknown){return String(value??'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function phrase(text:string,value:string){const p=normalize(value);return p.length>=3&&(` ${text} `).includes(` ${p} `);}

const EXTERNAL_ACTORS=[
 'bp batam','badan pengusahaan batam','pemprov kepri','pemerintah provinsi kepulauan riau','pemprov kepulauan riau',
 'polda kepri','polresta barelang','polsek','kepolisian','bmkg','pln batam','bright pln batam','asdp','ksop','kpu',
 'bawaslu','imigrasi','bea cukai','bakamla','basarnas','tni','kejaksaan','pengadilan','pssi','xlsmart'
];
const PEMKO_TERMS=['pemko batam','pemkot batam','pemerintah kota batam','wali kota batam','wakil wali kota batam','sekda batam','sekretaris daerah kota batam'];
const EXTERNAL_LEAD=/^(?:bp batam|badan pengusahaan batam|pemprov(?: kepri| kepulauan riau)?|polda kepri|polresta barelang|polsek\b|bmkg\b|pln batam|bright pln|asdp\b|ksop\b|kpu\b|bawaslu\b|imigrasi\b|bea cukai\b|bakamla\b|basarnas\b|tni\b|kejaksaan\b|pengadilan\b|pssi\b|xlsmart\b)/i;

export async function classifyNews(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const article=(await pool.query(`SELECT id,title,summary,news_classification,news_classification_source FROM articles WHERE id=$1`,[articleId])).rows[0];
 if(!article)return null;
 if(article.news_classification_source==='MANUAL'&&(article.news_classification==='UTAMA'||article.news_classification==='PENDUKUNG'))return{classification:article.news_classification,source:'MANUAL',reason:'manual override preserved',signals:['MANUAL_OVERRIDE']};
 const title=normalize(article.title),summary=normalize(article.summary),text=`${title} ${summary}`.trim();
 const external=EXTERNAL_ACTORS.filter(x=>phrase(text,x));
 const pemko=PEMKO_TERMS.filter(x=>phrase(text,x));
 const opdRows=(await pool.query(`SELECT code,name FROM opd WHERE active=true ORDER BY id`)).rows;
 const opdHits:string[]=[];
 for(const row of opdRows){const code=normalize(row.code),name=normalize(row.name);if((code.length>=4&&phrase(title,code))||(name.length>=5&&phrase(title,name)))opdHits.push(String(row.code||row.name));}
 // Master Classification is jurisdiction evidence. Only PRIMARY keyword routes are considered here;
 // SUPPORTING routes cannot promote a story to UTAMA on their own. Headline evidence is strongest,
 // while two or more summary hits are required when the headline itself has no mapped keyword.
 const masterRows=(await pool.query(`SELECT DISTINCT k.keyword,o.code opd_code FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories tc ON tc.id=kt.category_id AND tc.active=true JOIN classification_sectors cs ON cs.id=tc.sector_id AND cs.active=true JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true AND ko.routing_role='PRIMARY' JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE k.active=true AND k.organization_id IS NOT NULL AND k.opd_id IS NULL AND k.district_id IS NULL AND tc.organization_id=k.organization_id AND cs.organization_id=k.organization_id ORDER BY k.keyword`)).rows;
 const titleMaster=masterRows.filter((r:any)=>phrase(title,String(r.keyword||'')));
 const summaryMaster=masterRows.filter((r:any)=>phrase(summary,String(r.keyword||'')));
 const strongMaster=titleMaster.length>0||new Set(summaryMaster.map((r:any)=>String(r.keyword))).size>=2;
 const masterSignals=[...new Set((titleMaster.length?titleMaster:summaryMaster).map((r:any)=>`${r.keyword}->${r.opd_code}`))].slice(0,8);
 const externalLead=EXTERNAL_LEAD.test(title);
 let classification:NewsClassification;
 let reason:string;
 // Explicit outside-government headline actors take precedence over keyword routing. This keeps
 // BP Batam/PLN/BMKG/PSSI/etc. as situational news even when their story mentions a Pemko topic.
 if(externalLead){classification='PENDUKUNG';reason='external institution is the primary headline actor';}
 else if(pemko.length||opdHits.length){classification='UTAMA';reason=pemko.length?'direct Pemko Batam signal':'direct active OPD signal';}
 else if(strongMaster){classification='UTAMA';reason=titleMaster.length?'strong Primary OPD master-classification evidence in headline':'multiple Primary OPD master-classification signals in summary';}
 else if(external.length){classification='PENDUKUNG';reason='external institution/jurisdiction signal without direct Pemko actor';}
 else {classification='PENDUKUNG';reason='Batam-relevant context without sufficient Pemko jurisdiction evidence';}
 const signals=[...new Set([...pemko,...opdHits,...external,...masterSignals])].slice(0,16);
 await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,classification]);
 return{classification,source:'AUTO',reason,signals};
}

export async function clearSupportingIntelligenceLinks(pool:Pool,articleId:string){
 // Supporting news must never drive Pemko issue volume/risk. OPD/UPTD routing is also cleared.
 await pool.query(`DELETE FROM issue_articles WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_opd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_uptd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type IN ('keyword','taxonomy','uptd')`,[articleId]);
 await pool.query(`UPDATE articles SET opd_id=NULL,district_id=NULL WHERE id=$1`,[articleId]);
}
