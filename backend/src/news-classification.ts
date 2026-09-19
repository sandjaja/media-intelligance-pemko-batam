import type { Pool } from 'pg';

export type NewsClassification='UTAMA'|'PENDUKUNG';
export type NewsClassificationDecision={classification:NewsClassification;source:'AUTO'|'MANUAL';reason:string;signals:string[]};

function normalize(value:string){return String(value||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();}
function containsPhrase(text:string,phrase:string){const t=` ${normalize(text)} `,p=normalize(phrase);return p.length>=2&&t.includes(` ${p} `);}

async function readManual(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const row=(await pool.query(`SELECT news_classification,news_classification_source FROM articles WHERE id=$1`,[articleId])).rows[0];
 if(!row)return null;
 if(row.news_classification_source==='MANUAL'&&(row.news_classification==='UTAMA'||row.news_classification==='PENDUKUNG'))return{classification:row.news_classification,source:'MANUAL',reason:'manual override preserved',signals:['MANUAL_OVERRIDE']};
 return null;
}

/**
 * A generated article_opd PRIMARY row is not sufficient proof by itself: the legacy router
 * can promote direct OPD/UPTD evidence. AUTO UTAMA therefore requires contextual evidence
 * from an active Master Keyword whose keyword_opd mapping is explicitly PRIMARY for the
 * routed OPD. One title hit or two summary keyword hits are required.
 */
async function masterPrimaryEvidence(pool:Pool,articleId:string){
 const article=(await pool.query(`SELECT id,title,summary FROM articles WHERE id=$1`,[articleId])).rows[0];if(!article)return null;
 const routed=(await pool.query(`SELECT ao.opd_id,o.code FROM article_opd ao JOIN opd o ON o.id=ao.opd_id AND o.active=true WHERE ao.article_id=$1 AND ao.routing_role='PRIMARY' ORDER BY ao.relevance_score DESC NULLS LAST,ao.updated_at DESC LIMIT 1`,[articleId])).rows[0];if(!routed)return null;
 const rows=(await pool.query(`SELECT DISTINCT k.id,k.keyword FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories tc ON tc.id=kt.category_id AND tc.active=true JOIN classification_sectors cs ON cs.id=tc.sector_id AND cs.active=true JOIN keyword_opd ko ON ko.keyword_id=k.id AND ko.active=true AND ko.routing_role='PRIMARY' JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE k.active=true AND k.organization_id IS NOT NULL AND k.opd_id IS NULL AND k.district_id IS NULL AND ko.opd_id=$1 AND tc.organization_id=k.organization_id AND cs.organization_id=k.organization_id ORDER BY k.id`,[routed.opd_id])).rows;
 const title=String(article.title||''),summary=String(article.summary||'');
 const titleHits=rows.filter((r:any)=>containsPhrase(title,String(r.keyword||'')));
 const summaryHits=rows.filter((r:any)=>containsPhrase(summary,String(r.keyword||'')));
 if(titleHits.length<1&&summaryHits.length<2)return null;
 const evidence=[...new Set([...titleHits,...summaryHits].map((r:any)=>String(r.keyword)))];
 return{opdId:String(routed.opd_id),code:String(routed.code||routed.opd_id),keywords:evidence};
}

/** AUTO status is derived only from true Master Classification PRIMARY evidence. */
export async function classifyNewsFromRouting(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const manual=await readManual(pool,articleId);if(manual)return manual;
 const exists=(await pool.query(`SELECT id FROM articles WHERE id=$1`,[articleId])).rows[0];if(!exists)return null;
 const primary=await masterPrimaryEvidence(pool,articleId);
 const classification:NewsClassification=primary?'UTAMA':'PENDUKUNG';
 const signals=primary?[`MASTER_PRIMARY_OPD:${primary.code}`,...primary.keywords.slice(0,8).map(k=>`MASTER_KEYWORD:${k}`)]:[];
 const reason=primary?'contextual Master Keyword maps to active PRIMARY OPD':'no contextual Master Keyword with active PRIMARY OPD routing';
 await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,classification]);
 return{classification,source:'AUTO',reason,signals};
}

export async function classifyNews(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const manual=await readManual(pool,articleId);if(manual)return manual;
 const {routeArticleHeadline}=await import('./analyzer.js');
 await routeArticleHeadline(pool,articleId);
 return classifyNewsFromRouting(pool,articleId);
}

export async function getManualNewsClassification(pool:Pool,articleId:string){return readManual(pool,articleId);}

export async function clearSupportingIntelligenceLinks(pool:Pool,articleId:string){
 await pool.query(`DELETE FROM issue_articles WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_opd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_uptd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type IN ('keyword','taxonomy','uptd')`,[articleId]);
 await pool.query(`UPDATE articles SET opd_id=NULL WHERE id=$1`,[articleId]);
}
