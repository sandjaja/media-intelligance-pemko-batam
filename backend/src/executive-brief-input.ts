import type {Pool} from 'pg';

// Bounded read-only snapshot. Eligibility matches Daily News/TV final evidence.
export const briefNewsSql=`WITH recent AS (
 SELECT 'online' channel,a.id,a.title,left(a.summary,500) summary,ms.name source_name,a.published_at,a.sentiment,a.risk_level::text,a.risk_score::float
 FROM articles a JOIN opd o ON o.id=a.opd_id AND o.organization_id=$1 LEFT JOIN media_sources ms ON ms.id=a.source_id
 WHERE a.news_classification='UTAMA' AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0
 AND (SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED'
 AND a.published_at>=$2::timestamptz AND a.published_at<=$3::timestamptz AND ($4::bigint IS NULL OR a.opd_id=$4)
 UNION ALL
 SELECT 'print',pa.id,pa.title,NULL,ms.name,pe.edition_date::timestamp AT TIME ZONE 'Asia/Jakarta',pa.sentiment,
 COALESCE(NULLIF(pa.ai_metadata->'intelligence'->>'riskLevel',''),CASE WHEN pa.risk_score>=80 THEN 'critical' WHEN pa.risk_score>=60 THEN 'high' WHEN pa.risk_score>=35 THEN 'medium' ELSE 'low' END),pa.risk_score::float
 FROM print_articles pa JOIN opd o ON o.id=pa.opd_id AND o.organization_id=$1 JOIN print_editions pe ON pe.id=pa.edition_id JOIN media_sources ms ON ms.id=pe.source_id
 WHERE lower(pa.status)='analyzed' AND pa.ai_metadata->'v16Routing'->>'routingStatus'='ROUTED' AND COALESCE(pa.ai_metadata->'v16Routing'->>'keywordId','')<>''
 AND pa.ai_metadata->'v16Routing'->>'keywordVerification'='ACCEPTED' AND pa.ai_metadata->'intelligence'->>'riskStatus'='FINAL'
 AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0
 AND pe.edition_date BETWEEN ($2::timestamptz AT TIME ZONE 'Asia/Jakarta')::date AND ($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::date AND ($4::bigint IS NULL OR pa.opd_id=$4)
 UNION ALL
 SELECT CASE WHEN sm.source_kind='owned' THEN 'owned' ELSE 'social' END,sm.id,COALESCE(sm.title,left(sm.content,240)),left(sm.content,500),COALESCE(osa.account_name,sm.author_name,sm.platform),COALESCE(sm.published_at,sm.captured_at),sm.sentiment,sm.risk_level::text,sm.risk_score::float
 FROM social_mentions sm JOIN opd o ON o.id=sm.opd_id AND o.organization_id=$1 LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
 WHERE sm.content_type NOT IN ('comment','reply') AND sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0 AND (
 (sm.source_kind='external' AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND (sm.metadata->'socialVerification'->>'status'='LOCKED' OR sm.metadata->'manualClassification'->>'locked'='true') AND sm.metadata->'intelligence'->>'riskStatus'='FINAL') OR
 (sm.source_kind='owned' AND sm.curation_status='approved' AND sm.metadata->'v16Routing'->>'verificationStatus'='LOCKED' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND sm.metadata->'intelligence'->>'riskStatus'='FINAL'))
 AND COALESCE(sm.published_at,sm.captured_at)>=$2::timestamptz AND COALESCE(sm.published_at,sm.captured_at)<=$3::timestamptz AND ($4::bigint IS NULL OR sm.opd_id=$4)
) SELECT count(*)::int total,count(*) FILTER(WHERE sentiment='negative')::int negative,count(*) FILTER(WHERE risk_level IN ('high','critical'))::int high_risk,
 COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM recent ORDER BY risk_score DESC,published_at DESC,id DESC LIMIT 10)x),'[]'::jsonb) items FROM recent`;

export const briefIssuesSql=`WITH ongoing AS (
 SELECT i.id,i.title,lower(i.status) status,i.updated_at,risk.risk_score FROM issues i
 LEFT JOIN LATERAL(SELECT CASE WHEN COALESCE((m.metadata->>'assessed')::boolean,false) THEN m.risk_score ELSE NULL END risk_score FROM issue_metrics m WHERE m.issue_id=i.id ORDER BY m.measured_at DESC,m.id DESC LIMIT 1) risk ON TRUE
 WHERE i.organization_id=$1 AND lower(i.status) IN ('watch','active') AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM issue_opd io WHERE io.issue_id=i.id AND io.opd_id=$2 AND io.responsibility='leading'))
) SELECT count(*)::int total,count(*) FILTER(WHERE status='active')::int active,count(*) FILTER(WHERE status='watch')::int watch,
 COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM ongoing ORDER BY risk_score DESC NULLS LAST,updated_at DESC,id DESC LIMIT 5)x),'[]'::jsonb) items FROM ongoing`;

export async function readExecutiveBriefInput(pool:Pick<Pool,'query'>,opdId:string|null=null,now=new Date()){
 const organizations=(await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2')).rows;
 if(organizations.length!==1)throw Error('EXECUTIVE_BRIEF_ORGANIZATION_UNRESOLVED');
 const from=new Date(now.getTime()-86400000).toISOString(),to=now.toISOString(),org=organizations[0].id;
 const [news,issues,collection]=await Promise.all([
  pool.query(briefNewsSql,[org,from,to,opdId]),pool.query(briefIssuesSql,[org,opdId]),
  pool.query(`SELECT status,started_at,finished_at FROM collection_scheduler_runs WHERE (started_at AT TIME ZONE 'Asia/Jakarta')::date=($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date ORDER BY started_at DESC LIMIT 1`,[to]),
 ]);
 const limit=(v:unknown,n:number)=>String(v??'').slice(0,n);
 const newsData=news.rows[0]||{total:0,negative:0,high_risk:0,items:[]},issueData=issues.rows[0]||{total:0,active:0,watch:0,items:[]};
 return {period:{from,to,timezone:'Asia/Jakarta',printDatePrecision:'day'},collection:collection.rows[0]||{status:'NOT_RECORDED'},news:{...newsData,items:(newsData.items||[]).slice(0,10).map((x:any)=>({...x,title:limit(x.title,240),summary:limit(x.summary,500),source_name:limit(x.source_name,120)}))},issues:{...issueData,items:(issueData.items||[]).slice(0,5).map((x:any)=>({...x,title:limit(x.title,240)}))}};
}
export type ExecutiveBriefInput=Awaited<ReturnType<typeof readExecutiveBriefInput>>;
