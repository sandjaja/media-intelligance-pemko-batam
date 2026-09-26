import type { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { applyRisk } from './risk.js';
import { routeArticleV16 } from './atomic-router-v16.js';
import { getManualNewsClassification, clearSupportingIntelligenceLinks } from './news-classification.js';
import { loadOrganizationMediaScope } from './organization-media-scope.js';
import { classifyOnlineArticleRole } from './organization-actor-gate.js';
import { recalculateIssueRisk } from './issue-risk.js';

export const CLASSIFICATION_VERSION='article-opd-v17-20260926-human-analysis-gate';
export type AnalysisOptions={onlineGateRole?:'UTAMA'|'PENDUKUNG'|null;onlineGateReason?:string|null;onlineGateSignals?:string[]};

async function detachIneligibleIssueLinks(pool:Pool,articleId:string,reason:string){
 const linked=(await pool.query(`SELECT DISTINCT issue_id FROM issue_articles WHERE article_id=$1`,[articleId])).rows.map((r:any)=>Number(r.issue_id)).filter(Number.isFinite);
 if(!linked.length)return;
 await pool.query(`DELETE FROM issue_articles WHERE article_id=$1`,[articleId]);
 await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES(NULL,'ONLINE_INELIGIBLE_ISSUE_LINKS_REMOVED',$2::jsonb)`,[articleId,JSON.stringify({articleId:String(articleId),issueIds:linked,reason,classificationVersion:CLASSIFICATION_VERSION})]).catch(()=>undefined);
 for(const issueId of linked)await recalculateIssueRisk(pool,issueId);
}

export async function analyzeArticle(pool:Pool,articleId:string,options:AnalysisOptions={}){
 const article=(await pool.query(`SELECT a.id,a.source_id,a.title,a.url,a.content,a.summary,a.published_at,ms.name source_name,ms.tier,ms.category media_kind FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`,[articleId])).rows[0];
 if(!article)return null;
 let news=await getManualNewsClassification(pool,articleId); // Only MANUAL is authoritative; existing AUTO classification is recomputed on every analysis.
 let gateRole=article.media_kind==='online'?options.onlineGateRole??null:null;
 let gateReason=options.onlineGateReason??null;
 let gateSignals=options.onlineGateSignals??[];
 let onlineOutOfScope=false;
 if(article.media_kind==='online'&&!gateRole){
  const scope=await loadOrganizationMediaScope(pool);
  if(scope){
   const decision=classifyOnlineArticleRole({sourceId:String(article.source_id||''),title:String(article.title||''),url:String(article.url||''),publishedAt:article.published_at?new Date(article.published_at):new Date(),excerpt:String(article.summary||article.content||'')},scope);
   if(decision.role==='OUT_OF_SCOPE'){
    onlineOutOfScope=true;
    gateReason=decision.reason;
    gateSignals=decision.scope.matchedTerms.map(t=>`SCOPE:${t}`);
   }else{
    gateRole=decision.role;
    gateReason=decision.reason;
    gateSignals=[...decision.actorMatches.map(a=>`ACTOR:${a.kind}:${a.name}`),...decision.scope.matchedTerms.map(t=>`SCOPE:${t}`)];
   }
  }
 }
 // Organization Scope is the first gate for automatic Online classification.
 // An OUT_OF_SCOPE headline must never reach Master Classification/routing, otherwise
 // a generic taxonomy/OPD keyword can promote an external article back to UTAMA.
 // Explicit MANUAL decisions remain authoritative and are never overwritten here.
 if(article.media_kind==='online'&&onlineOutOfScope&&!news){
  await clearSupportingIntelligenceLinks(pool,articleId);
  await detachIneligibleIssueLinks(pool,articleId,'AUTO_ORGANIZATION_SCOPE_OUT_OF_SCOPE');
  await pool.query(`UPDATE articles SET news_classification='PENDUKUNG',news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW(),classified_at=NOW(),classification_version=$2 WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,CLASSIFICATION_VERSION]);
  // Keep the stored classification for audit/history, but hide automatic OUT_OF_SCOPE
  // Online articles from the default relevant feed using the existing moderation contract.
  // Do not create duplicate markers on repeated reanalysis.
  await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) SELECT NULL,'ONLINE_ARTICLE_MARKED_IRRELEVANT',$2::jsonb WHERE NOT EXISTS (SELECT 1 FROM audit_logs al WHERE al.action='ONLINE_ARTICLE_MARKED_IRRELEVANT' AND al.metadata->>'articleId'=$1)`,[articleId,JSON.stringify({articleId:String(articleId),reason:'AUTO_ORGANIZATION_SCOPE_OUT_OF_SCOPE',source:'AUTO_ORGANIZATION_SCOPE',classificationVersion:CLASSIFICATION_VERSION})]);
  await pool.query(`UPDATE articles SET opd_id=NULL,sentiment=NULL,sentiment_score=NULL,importance_score=NULL,impact_score=NULL,velocity_score=NULL,risk_score=NULL,risk_level=NULL,is_highlight=false WHERE id=$1`,[articleId]);
  return{articleId,newsClassification:'PENDUKUNG',newsClassificationSource:'AUTO',newsClassificationReason:gateReason||'outside configured organization scope',newsClassificationSignals:gateSignals,classificationSource:'AUTO_ORGANIZATION_SCOPE',routingStatus:'OUT_OF_SCOPE',needsVerification:false,classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:null,taxonomyName:null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,sentiment:null,importance:null,impact:null,velocity:null,highlight:false,keywordMatches:0,matchedKeywords:[],entities:[],risk:null};
 }
 // Machine 1 (Organization Scope/actor evidence) never decides UTAMA/PENDUKUNG.
 // For automatic decisions Machine 2 is authoritative: Master Keyword -> UTAMA;
 // no keyword + known OPD actor -> AMBIGUOUS; neither -> PENDUKUNG.
 let routing:any=null;
 if(!news){
  routing=await routeArticleV16(pool,articleId);
  const hasKeyword=Boolean(routing?.keywordId)||(routing?.matchedKeywords??[]).length>0;
  const hasPrimary=Boolean(routing?.opdId);
  const hasOpdActor=(gateSignals??[]).some((s:string)=>s.startsWith('ACTOR:OPD:')||s.startsWith('ACTOR:UPTD:'));
  const ambiguous=!hasKeyword&&(hasOpdActor||routing?.routingStatus==='AMBIGUOUS');
  news={
   classification:hasKeyword&&hasPrimary?'UTAMA':ambiguous?'UTAMA':'PENDUKUNG',
   source:'AUTO' as const,
   reason:hasKeyword&&hasPrimary?'Master Keyword found and mapped to Primary OPD':ambiguous?'OPD context found but no Master Keyword; Humas review required':'no Master Keyword and no OPD evidence',
   signals:hasKeyword&&hasPrimary?[`MASTER_PRIMARY_OPD:${routing.opdId}`,...(routing?.matchedKeywords??[]).slice(0,8).map((k:string)=>`MASTER_KEYWORD:${k}`)]:ambiguous?[...(gateSignals??[]),...(routing?.opdId?[`AMBIGUOUS_OPD:${routing.opdId}`]:[])]:[]
  };
  await pool.query(`UPDATE articles SET news_classification=$2,news_classification_source='AUTO',news_classification_changed_by=NULL,news_classification_changed_at=NOW() WHERE id=$1 AND news_classification_source<>'MANUAL'`,[articleId,news.classification]);
 }else if(news.classification==='UTAMA'){
  routing=await routeArticleV16(pool,articleId);
 }
 if(!news)return null;
 if(news.classification==='PENDUKUNG'){
  await clearSupportingIntelligenceLinks(pool,articleId);
  await detachIneligibleIssueLinks(pool,articleId,'ONLINE_CLASSIFICATION_PENDUKUNG');
  await pool.query(`UPDATE articles SET opd_id=NULL,sentiment=NULL,importance_score=0,impact_score=NULL,velocity_score=NULL,risk_score=0,risk_level=NULL,is_highlight=false,classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
  return{articleId,newsClassification:'PENDUKUNG',newsClassificationSource:news.source,newsClassificationReason:news.reason,newsClassificationSignals:news.signals,routingStatus:'UNROUTED',needsVerification:true,classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:null,taxonomyName:null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,sentiment:null,importance:0,impact:null,velocity:null,highlight:false,keywordMatches:0,matchedKeywords:[],entities:[],risk:null};
 }
 const opdId=routing?.opdId??null;
 if(!opdId){
  if(news.source==='MANUAL')throw new Error('MANUAL_UTAMA_REQUIRES_PRIMARY_OPD_ROUTING');
  await detachIneligibleIssueLinks(pool,articleId,'ONLINE_CLASSIFICATION_AMBIGUOUS');
  await pool.query(`UPDATE articles SET opd_id=NULL,news_classification='UTAMA',news_classification_source='AUTO',sentiment=NULL,importance_score=0,impact_score=NULL,velocity_score=NULL,risk_score=0,risk_level=NULL,is_highlight=false,classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
  const reason=gateRole==='UTAMA'?(gateReason||'organization/OPD evidence found but Master Keyword requires Humas review'):'Master Classification requires Humas keyword review';
  const signals=gateRole==='UTAMA'?gateSignals:(routing?.opdId?[`AMBIGUOUS_OPD:${routing.opdId}`]:[]);
  return{articleId,newsClassification:'UTAMA',newsClassificationSource:'AUTO',newsClassificationReason:reason,newsClassificationSignals:signals,classificationSource:'AUTO_AMBIGUOUS',routingStatus:'AMBIGUOUS',needsVerification:true,classificationVersion:CLASSIFICATION_VERSION,opdId:null,supportingOpdIds:[],districtId:null,uptdId:null,uptdName:null,uptdMatches:0,taxonomyId:routing?.taxonomyId??null,taxonomyName:routing?.taxonomyName??null,taxonomyScore:0,issueId:null,issueMatchScore:0,issueAssignmentSource:null,sentiment:null,importance:0,impact:null,velocity:null,risk:null};
 }
 // AUTO UTAMA is a classification proposal only. Intelligence starts after Humas verifies/locks it.
 const verified=(await pool.query(`SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=$1 ORDER BY al.created_at DESC,al.id DESC LIMIT 1`,[articleId])).rows[0]?.action==='ARTICLE_CLASSIFICATION_VERIFIED';
 if(!verified){
  await detachIneligibleIssueLinks(pool,articleId,'ONLINE_PRIMARY_AWAITING_VERIFICATION');
  await pool.query(`UPDATE articles SET sentiment=NULL,importance_score=0,impact_score=NULL,velocity_score=NULL,risk_score=0,risk_level=NULL,is_highlight=false,classified_at=NOW(),classification_version=$2 WHERE id=$1`,[articleId,CLASSIFICATION_VERSION]);
  return{articleId,newsClassification:'UTAMA',newsClassificationSource:news.source,newsClassificationReason:news.reason,newsClassificationSignals:news.signals,routingStatus:'ROUTED',needsVerification:true,classificationVersion:CLASSIFICATION_VERSION,opdId,supportingOpdIds:routing?.supportingOpdIds??[],taxonomyId:routing?.taxonomyId??null,taxonomyName:routing?.taxonomyName??null,keywordMatches:routing?.keywordMatches??0,matchedKeywords:routing?.matchedKeywords??[],sentiment:null,importance:0,impact:null,velocity:null,risk:null};
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
