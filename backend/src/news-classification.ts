import type { Pool } from 'pg';

export type NewsClassification='UTAMA'|'PENDUKUNG';
export type NewsClassificationDecision={classification:NewsClassification;source:'AUTO'|'MANUAL';reason:string;signals:string[]};

async function readManual(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const row=(await pool.query(`SELECT news_classification,news_classification_source FROM articles WHERE id=$1`,[articleId])).rows[0];
 if(!row)return null;
 if(row.news_classification_source==='MANUAL'&&(row.news_classification==='UTAMA'||row.news_classification==='PENDUKUNG'))return{classification:row.news_classification,source:'MANUAL',reason:'manual override preserved',signals:['MANUAL_OVERRIDE']};
 return null;
}

/** AUTO status is derived only from the result of Master Classification routing. */
export async function classifyNewsFromRouting(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const manual=await readManual(pool,articleId);if(manual)return manual;
 const exists=(await pool.query(`SELECT id FROM articles WHERE id=$1`,[articleId])).rows[0];if(!exists)return null;
 const primary=(await pool.query(`SELECT ao.opd_id,o.code FROM article_opd ao JOIN opd o ON o.id=ao.opd_id AND o.active=true WHERE ao.article_id=$1 AND ao.routing_role='PRIMARY' ORDER BY ao.relevance_score DESC NULLS LAST,ao.updated_at DESC LIMIT 1`,[articleId])).rows[0];
 const classification:NewsClassification=primary?'UTAMA':'PENDUKUNG';
 const signals=primary?[`PRIMARY_OPD:${String(primary.code||primary.opd_id)}`]:[];
 const reason=primary?'Primary OPD routing exists':'no Primary OPD routing';
 await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,classification]);
 return{classification,source:'AUTO',reason,signals};
}

/**
 * Compatibility entry point used by analyzer.ts.
 * Important sequencing rule: AUTO articles are routed by Master Classification FIRST,
 * then their news status is derived from whether a PRIMARY OPD route exists.
 * A MANUAL decision is returned immediately and can never be overwritten by reanalysis.
 *
 * Dynamic import avoids a static circular dependency while analyzer sequencing is being
 * consolidated. It can be removed once analyzer.ts owns this ordering directly.
 */
export async function classifyNews(pool:Pool,articleId:string):Promise<NewsClassificationDecision|null>{
 const manual=await readManual(pool,articleId);if(manual)return manual;
 const {routeArticleHeadline}=await import('./analyzer.js');
 await routeArticleHeadline(pool,articleId);
 return classifyNewsFromRouting(pool,articleId);
}

export async function getManualNewsClassification(pool:Pool,articleId:string){return readManual(pool,articleId);}

export async function clearSupportingIntelligenceLinks(pool:Pool,articleId:string){
 // PENDUKUNG is situational awareness only: it must not drive Pemko OPD/UPTD/Issue/Risk routing.
 await pool.query(`DELETE FROM issue_articles WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_opd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_uptd WHERE article_id=$1`,[articleId]);
 await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type IN ('keyword','taxonomy','uptd')`,[articleId]);
 await pool.query(`UPDATE articles SET opd_id=NULL WHERE id=$1`,[articleId]);
}
