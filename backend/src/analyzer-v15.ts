import type { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';
import { routeArticleV16 } from './atomic-router-v16.js';
import { getManualNewsClassification, clearSupportingIntelligenceLinks } from './news-classification.js';
import { loadOrganizationMediaScope } from './organization-media-scope.js';
import { classifyOnlineArticleRole } from './organization-actor-gate.js';

export const CLASSIFICATION_VERSION='article-opd-v16.5-20260916';
export type AnalysisOptions={onlineGateRole?:'UTAMA'|'PENDUKUNG'|null;onlineGateReason?:string|null;onlineGateSignals?:string[]};

export async function analyzeArticle(pool:Pool,articleId:string,options:AnalysisOptions={}){
 const article=(await pool.query(`SELECT a.id,a.source_id,a.title,a.url,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];
 if(!article)return null;
 let news=await getManualNewsClassification(pool,articleId);
 let gateRole=article.media_kind==='online'?options.onlineGateRole??null:null;
 let gateReason=options.onlineGateReason??null;
 let gateSignals=options.onlineGateSignals??[];
 if(!news&&article.media_kind==='online'&&!gateRole){
  const scope=await loadOrganizationMediaScope(pool);
  if(scope){
   const decision=classifyOnlineArticleRole({sourceId:String(article.source_id||''),title:String(article.title||''),url:String(article.url||''),publishedAt:article.published_at?new Date(article.published_at):new Date(),excerpt:String(article.summary||article.content||'')},scope);
   if(decision.role!=='OUT_OF_SCOPE'){
    gateRole=decision.role;
    gateReason=decision.reason;
    gateSignals=[...decision.actorMatches.map(a=>`ACTOR:${a.kind}:${a.name}`),...decision.scope.matchedTerms.map(t=>`SCOPE:${t}`)];
   }
  }
 }
 if(!news&&gateRole){
  news={classification:gateRole,source:'AUTO' as const,reason:gateReason||'online organization actor gate',signals:gateSignals};
  await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,gateRole]);
 }
 let routing:any=null;
 if(!news||news.classification==='UTAMA'){
  routing=await routeArticleV16(pool,articleId);
  if(!news){
   const hasPrimary=Boolean(routing?.opdId),ambiguous=routing?.routingStatus==='AMBIGUOUS';
   news={classification:(hasPrimary||ambiguous)?'UTAMA':'PENDUKUNG',source:'AUTO' as const,reason:hasPrimary?'valid v16 Master PRIMARY OPD routing':ambiguous?'relevant headline taxonomy detected but Primary OPD routing is ambiguous':'no v16 Master PRIMARY OPD routing',signals:hasPrimary?[`MASTER_PRIMARY_OPD:${routing.opdId}`,...(routing?.matchedKeywords??[]).slice(0,8).map((k:string)=>`MASTER_KEYWORD:${k}`)]:ambiguous?(routing?.headlineTaxonomyNames??[]).map((t:string)=>`AMBIGUOUS_HEADLINE_TAXONOMY:${t}`):[]};
   await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,news.classification]);
  }
 }
 if(!news)return null;
 if(news.classification==='PENDUKUNG'){
  await clearSupportingIntelligenceLinks(pool,articleId);
  const peerResult=await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`,[articleId,`%${String(article.title).slice(0,80)}%`]);
  const peerCount=Number(peerResult.rows[0]?.count??1)+1;
  const analysis=analyzeCoreArticle({id:article.id,title:article.title,summary:article.summary,content:article.content,sourceName:article.source_name,sourceTier:Number(article.tier??2),mediaKind:article.media_kind==='print'?'print':article.media_kind==='social'?'social':'online',opdId:null,publishedAt:article.published_at},parseKeywordQuery(''),peerCount);
  await pool.query(`UPDATE articles SET opd_id=NULL,sentiment=$2,importance_score=$3,impact_score=$4,velocity_score=$5,risk_score=0,risk_level='low',is_highlight=false,summary=COALESCE(NULLIF(summary,''),$6),classified_at=NOW(),classification_version=$7 WHERE id=$1`,[articleId,analysis.sentiment,analysis.importanceScore,analysis.impactScore,analysis.velocityScore,String(article.content??article.title).slice(0,300),CLASSIFICATION_VERSION]);
  await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='entity'`,[articleId]);
  for(const entity of analysis.entities.slice(0,20))await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2) ON CONFLICT DO NOTHING`,[articleId,entity]);
  return{articleId,newsClassification:news.classification,newsClassificationSource:news.source,newsClassificationReason:news.reason,newsClassificationSignals:news.signals,classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:null,taxonomyName:null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,sentiment:analysis.sentiment,importance:analysis.importanceScore,impact:analysis.impactScore,velocity:analysis.velocityScore,highlight:false,keywordMatches:0,matchedKeywords:[],entities:analysis.entities,risk:null};
 }
 const opdId=routing?.opdId??null;
 if(!opdId){
  if(news.source==='MANUAL')throw new Error('MANUAL_UTAMA_REQUIRES_PRIMARY_OPD_ROUTING');
  const gateUtama=gateRole==='UTAMA';
  if(routing?.routingStatus==='AMBIGUOUS'||gateUtama){
   await pool.query(`DELETE FROM issue_articles WHERE article_id=$1 AND assignment_source='AUTO'`,[articleId]);
   await pool.query(`UPDATE articles SET opd_id=NULL,news_classification='UTAMA',news_classification_source='AUTO',risk_score=0,risk_level='low',is_highlight=false,classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
   const reason=gateUtama?(gateReason||'online actor gate classified article as UTAMA; Primary OPD requires verification'):'relevant headline taxonomy detected but Primary OPD routing is ambiguous';
   const signals=gateUtama?gateSignals:(routing?.headlineTaxonomyNames??[]).map((t:string)=>`AMBIGUOUS_HEADLINE_TAXONOMY:${t}`);
   return{articleId,newsClassification:'UTAMA',newsClassificationSource:'AUTO',newsClassificationReason:reason,newsClassificationSignals:signals,classificationSource:gateUtama?'AUTO_ACTOR_GATE_AMBIGUOUS':'AUTO_AMBIGUOUS',routingStatus:'AMBIGUOUS',needsVerification:true,classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:routing?.taxonomyId??null,taxonomyName:routing?.taxonomyName??null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,risk:null};
  }
  await clearSupportingIntelligenceLinks(pool,articleId);
  await pool.query(`UPDATE articles SET news_classification='PENDUKUNG',news_classification_source='AUTO',risk_score=0,risk_level='low',is_highlight=false,classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
  return{articleId,newsClassification:'PENDUKUNG',newsClassificationSource:'AUTO',newsClassificationReason:'no v16 Master PRIMARY OPD routing',newsClassificationSignals:[],classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:null,taxonomyName:null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,risk:null};
 }
 const matchedNames=routing?.matchedKeywords??[],query=parseKeywordQuery(matchedNames.join(' | '));
 const peerResult=await pool.query(`SELECT COUNT(*)::int count FROM articles WHERE id<>$1 AND (title ILIKE $2 OR summary ILIKE $2)`,[articleId,`%${String(article.title).slice(0,80)}%`]);
 const peerCount=Number(peerResult.rows[0]?.count??1)+1;
 const analysis=analyzeCoreArticle({id:article.id,title:article.title,summary:article.summary,content:article.content,sourceName:article.source_name,sourceTier:Number(article.tier??2),mediaKind:article.media_kind==='print'?'print':article.media_kind==='social'?'social':'online',opdId,publishedAt:article.published_at},query,peerCount);
 await pool.query(`UPDATE articles SET opd_id=$2,sentiment=$3,importance_score=$4,impact_score=$5,velocity_score=$6,risk_score=$7,risk_level=$8,is_highlight=$9,summary=COALESCE(NULLIF(summary,''),$10) WHERE id=$1`,[articleId,opdId,analysis.sentiment,analysis.importanceScore,analysis.impactScore,analysis.velocityScore,analysis.riskScore,analysis.riskLevel,analysis.importanceScore>=65||analysis.riskLevel==='high'||analysis.riskLevel==='critical',String(article.content??article.title).slice(0,300)]);
 await pool.query(`DELETE FROM article_entities WHERE article_id=$1 AND entity_type='entity'`,[articleId]);
 for(const entity of analysis.entities.slice(0,20))await pool.query(`INSERT INTO article_entities(article_id,entity_type,entity_name) VALUES($1,'entity',$2) ON CONFLICT DO NOTHING`,[articleId,entity]);
 const risk=await applyRisk(pool,articleId);
 await pool.query(`UPDATE articles SET classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
 return{articleId,newsClassification:news.classification,newsClassificationSource:news.source,newsClassificationReason:news.reason,newsClassificationSignals:news.signals,classificationSource:routing?.classificationSource??'AUTO_V16',routingStatus:routing?.routingStatus??'ROUTED',needsVerification:false,classificationVersion:CLASSIFICATION_VERSION,opdId,supportingOpdIds:routing?.supportingOpdIds??[],districtId:routing?.districtId??null,uptdId:routing?.uptdId??null,uptdName:routing?.uptdName??null,uptdMatches:routing?.uptdMatches??0,taxonomyId:routing?.taxonomyId??null,taxonomyName:routing?.taxonomyName??null,taxonomyScore:routing?.taxonomyScore??0,issueId:routing?.issueId??null,issueMatchScore:routing?.issueMatchScore??0,issueAssignmentSource:routing?.issueAssignmentSource??null,sentiment:analysis.sentiment,importance:analysis.importanceScore,impact:analysis.impactScore,velocity:analysis.velocityScore,highlight:analysis.importanceScore>=65||analysis.riskLevel==='high'||analysis.riskLevel==='critical',keywordMatches:matchedNames.length,matchedKeywords:matchedNames,entities:analysis.entities,duplicateFingerprint:analysis.duplicateFingerprint,risk};
}
