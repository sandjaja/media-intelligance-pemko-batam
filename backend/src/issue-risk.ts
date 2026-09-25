import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;
type IssueRiskLevel = 'low'|'medium'|'high'|'critical';

export const clampIssueMetric=(v:number)=>Math.max(0,Math.min(100,Number.isFinite(v)?v:0));
const clamp=clampIssueMetric;
const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
export const issueRiskLevel=(score:number):IssueRiskLevel=>score>=80?'critical':score>=60?'high':score>=35?'medium':'low';
const level=issueRiskLevel;

export function calculateIssueRiskComponents(input:{negativeShare:number;negativeIntensity:number;importance:number;impact:number;velocity:number}){
 const sentiment=clamp(input.negativeShare*.65+input.negativeIntensity*.35),importance=clamp(input.importance),impact=clamp(input.impact),velocity=clamp(input.velocity);
 const score=Math.round(clamp(sentiment*.30+importance*.25+impact*.25+velocity*.20));
 return {score,level:level(score),components:{sentiment:Math.round(sentiment),importance:Math.round(importance),impact:Math.round(impact),velocity:Math.round(velocity)}};
}

type Evidence={source:'online'|'print'|'social';sentiment:string|null;risk:number;importance:number;impact:number|null;velocity:number|null;valid:boolean};

export async function recalculateIssueRisk(db:Db,issueId:number){
 const issue=(await db.query(`SELECT id,status FROM issues WHERE id=$1`,[issueId])).rows[0];
 if(!issue)return null;

 const online=(await db.query(`
  SELECT 'online' source,a.sentiment,COALESCE(a.risk_score,0)::float risk,
   COALESCE(a.importance_score,0)::float importance,
   a.impact_score::float impact,a.velocity_score::float velocity,
   (a.news_classification='UTAMA'
    AND (SELECT al.action FROM audit_logs al
         WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED')
           AND al.metadata->>'articleId'=a.id::text
         ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED'
    AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0) valid
  FROM issue_articles x JOIN articles a ON a.id=x.article_id WHERE x.issue_id=$1`,[issueId])).rows;
 const print=(await db.query(`
  SELECT 'print' source,pa.sentiment,COALESCE(pa.risk_score,0)::float risk,
   COALESCE(pa.importance_score,0)::float importance,
   NULLIF(pa.ai_metadata->'intelligence'->>'impactScore','')::float impact,
   NULLIF(pa.ai_metadata->'intelligence'->>'velocityScore','')::float velocity,
   (lower(pa.status)='analyzed' AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0
    AND COALESCE(pa.ai_metadata->'intelligence'->>'riskStatus',pa.ai_metadata->'phase2e'->>'riskStatus','FINAL')='FINAL') valid
  FROM issue_print_articles x JOIN print_articles pa ON pa.id=x.print_article_id
  WHERE x.issue_id=$1 AND x.linkage_status='linked'`,[issueId])).rows;
 const social=(await db.query(`
  SELECT 'social' source,sm.sentiment,COALESCE(sm.risk_score,0)::float risk,
   COALESCE(sm.importance_score,0)::float importance,
   COALESCE(sm.influence_score,0)::float impact,
   NULLIF(sm.metadata->'intelligence'->>'velocityScore','')::float velocity,
   (sm.source_kind='external'
    AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA'
    AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED'
    AND sm.opd_id IS NOT NULL
    AND (sm.metadata->'socialVerification'->>'status'='LOCKED'
      OR sm.metadata->'manualClassification'->>'locked'='true')
    AND COALESCE(sm.metadata->'intelligence'->>'riskStatus','')='FINAL'
    AND sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0) valid
  FROM social_mention_issues x JOIN social_mentions sm ON sm.id=x.mention_id
  WHERE x.issue_id=$1 AND sm.source_kind='external'`,[issueId])).rows;
 const linked=[...online,...print,...social] as Evidence[], valid=linked.filter(x=>x.valid);
 const ownedCount=Number((await db.query(`SELECT COUNT(*)::int n FROM social_mention_issues x JOIN social_mentions sm ON sm.id=x.mention_id WHERE x.issue_id=$1 AND sm.source_kind='owned'`,[issueId])).rows[0]?.n||0);

 if(!valid.length){
  await db.query(`UPDATE issues SET risk_level=NULL,updated_at=now() WHERE id=$1`,[issueId]);
  return {issueId,assessed:false,externalEvidence:0,validEvidence:0,excludedEvidence:linked.length,ownedCount};
 }
 const counts={positive:0,neutral:0,negative:0};
 for(const e of valid){const s=String(e.sentiment||'').toLowerCase();if(s==='positive')counts.positive++;else if(s==='negative')counts.negative++;else counts.neutral++;}
 const negativeShare=counts.negative/valid.length*100;
 const negativeIntensity=avg(valid.filter(e=>String(e.sentiment).toLowerCase()==='negative').map(e=>e.risk));
 const sentimentScore=clamp(negativeShare*.65+negativeIntensity*.35);
 const importanceScore=clamp(avg(valid.map(e=>e.importance)));
 const impactValues=valid.map(e=>e.impact).filter((x):x is number=>x!=null&&Number.isFinite(x));
 const impactScore=clamp(impactValues.length?avg(impactValues):avg(valid.map(e=>e.risk)));
 const velocityValues=valid.map(e=>e.velocity).filter((x):x is number=>x!=null&&Number.isFinite(x));
 const velocityScore=clamp(velocityValues.length?avg(velocityValues):Math.min(100,valid.length*10));
 const calculated=calculateIssueRiskComponents({negativeShare,negativeIntensity,importance:importanceScore,impact:impactScore,velocity:velocityScore});
 const riskScore=calculated.score,riskLevel=calculated.level;
 const metadata={engine:'issue-risk-event-v1',assessed:true,validEvidence:valid.length,totalExternalEvidence:valid.length,excludedEvidence:linked.length-valid.length,ownedCount,components:calculated.components,sentiment:{...counts,negativePercent:Math.round(counts.negative/valid.length*100),neutralPercent:Math.round(counts.neutral/valid.length*100),positivePercent:Math.round(counts.positive/valid.length*100)},sources:{online:valid.filter(x=>x.source==='online').length,print:valid.filter(x=>x.source==='print').length,social:valid.filter(x=>x.source==='social').length}};
 await db.query(`UPDATE issues SET risk_level=$2,momentum=$3,updated_at=now() WHERE id=$1`,[issueId,riskLevel,level(velocityScore)]);
 await db.query(`INSERT INTO issue_metrics(issue_id,media_volume,social_volume,positive_count,neutral_count,negative_count,velocity_score,influence_score,risk_score,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,[issueId,metadata.sources.online+metadata.sources.print,metadata.sources.social,counts.positive,counts.neutral,counts.negative,velocityScore,impactScore,riskScore,JSON.stringify(metadata)]);
 return {issueId,riskScore,riskLevel,...metadata};
}
