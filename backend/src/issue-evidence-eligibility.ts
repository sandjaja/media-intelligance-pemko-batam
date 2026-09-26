import type { Pool,PoolClient } from 'pg';

export type IssueEvidenceSource='PRINT'|'OWNED'|'ONLINE'|'SOCIAL';
export type IssueEvidenceEligibility={eligible:boolean;source:IssueEvidenceSource;reason:string;classification?:string|null;verificationStatus?:string|null};

type Db=Pick<Pool,'query'>|Pick<PoolClient,'query'>;

/**
 * Central Issue Evidence Eligibility Gate.
 * This is deliberately stricter than collection/classification: passing the
 * gate only makes a record available to Issue matching; it does not link it.
 */
export async function checkIssueEvidenceEligibility(db:Db,source:IssueEvidenceSource,id:number):Promise<IssueEvidenceEligibility>{
 if(!Number.isInteger(id)||id<=0)return{eligible:false,source,reason:'INVALID_EVIDENCE_ID'};
 if(source==='PRINT'){
  const row=(await db.query(`SELECT status,opd_id,sentiment,risk_score,ai_metadata FROM print_articles WHERE id=$1`,[id])).rows[0];
  if(!row)return{eligible:false,source,reason:'EVIDENCE_NOT_FOUND'};
  const routing=row.ai_metadata?.v16Routing,intelligence=row.ai_metadata?.intelligence;
  const analyzed=String(row.status||'').toLowerCase()==='analyzed';
  const primary=String(routing?.routingStatus||'')==='ROUTED'&&Boolean(routing?.keywordId)&&Boolean(row.opd_id);
  const verified=String(routing?.keywordVerification||'')==='ACCEPTED';
  const final=String(intelligence?.riskStatus||'')==='FINAL'&&row.sentiment!=null&&Number(row.risk_score||0)>0;
  const eligible=analyzed&&primary&&verified&&final;
  return{eligible,source,reason:eligible?'PRINT_PRIMARY_VERIFIED_FINAL':!analyzed?'PRINT_NOT_ANALYZED':!primary?'PRINT_REQUIRES_PRIMARY':!verified?'PRINT_REQUIRES_KEYWORD_VERIFICATION':'PRINT_REQUIRES_FINAL_ANALYSIS',classification:primary?'UTAMA':null,verificationStatus:verified?'LOCKED':'UNLOCKED'};
 }
 if(source==='OWNED'){
  const row=(await db.query(`SELECT source_kind,curation_status,metadata FROM social_mentions WHERE id=$1`,[id])).rows[0];
  if(!row)return{eligible:false,source,reason:'EVIDENCE_NOT_FOUND'};
  const v=row.metadata?.v16Routing,locked=v?.verificationStatus==='LOCKED',routed=v?.routingStatus==='ROUTED';
  const eligible=row.source_kind==='owned'&&row.curation_status==='approved'&&locked&&routed&&Boolean(v?.generatedAt);
  return{eligible,source,reason:eligible?'OWNED_ANALYZED_AND_LOCKED':'OWNED_REQUIRES_APPROVED_ANALYZED_LOCKED',verificationStatus:v?.verificationStatus??null};
 }
 if(source==='ONLINE'){
  const row=(await db.query(`SELECT a.news_classification,(SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1) verification_action FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1 AND lower(ms.category)='online'`,[id])).rows[0];
  if(!row)return{eligible:false,source,reason:'EVIDENCE_NOT_FOUND'};
  const verified=row.verification_action==='ARTICLE_CLASSIFICATION_VERIFIED',eligible=row.news_classification==='UTAMA'&&verified;
  return{eligible,source,reason:eligible?'ONLINE_PRIMARY_VERIFIED':row.news_classification!=='UTAMA'?'ONLINE_REQUIRES_PRIMARY':'ONLINE_REQUIRES_VERIFICATION',classification:row.news_classification??null,verificationStatus:verified?'LOCKED':'UNLOCKED'};
 }
 const row=(await db.query(`SELECT source_kind,metadata FROM social_mentions WHERE id=$1`,[id])).rows[0];
 if(!row)return{eligible:false,source,reason:'EVIDENCE_NOT_FOUND'};
 const v=row.metadata?.v16Routing,m=row.metadata?.manualClassification;
 const classification=String(m?.newsClassification||v?.newsClassification||'');
 const verified=row.metadata?.socialVerification?.status==='LOCKED';
 const eligible=row.source_kind==='external'&&classification==='UTAMA'&&verified;
 return{eligible,source,reason:eligible?'SOCIAL_PRIMARY_VERIFIED':classification!=='UTAMA'?'SOCIAL_REQUIRES_PRIMARY':'SOCIAL_REQUIRES_EXPLICIT_VERIFICATION',classification:classification||null,verificationStatus:verified?'LOCKED':'UNLOCKED'};
}

export async function assertIssueEvidenceEligible(db:Db,source:IssueEvidenceSource,id:number){
 const result=await checkIssueEvidenceEligibility(db,source,id);
 if(!result.eligible){const error=new Error(result.reason) as Error&{code?:string;eligibility?:IssueEvidenceEligibility};error.code='ISSUE_EVIDENCE_NOT_ELIGIBLE';error.eligibility=result;throw error;}
 return result;
}
