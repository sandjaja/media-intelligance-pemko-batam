import type {Pool} from 'pg';
import {get} from './private-storage.js';

export const displayDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
// Only final, locked evidence is eligible, with the same gates as Daily News.
export const displayNewsSql=`WITH daily AS (
 SELECT 'online'::text channel,a.id,a.title,ms.name source_name,a.published_at,a.sentiment,a.risk_level::text,a.risk_score::float
 FROM articles a JOIN opd o ON o.id=a.opd_id AND o.organization_id=$1 LEFT JOIN media_sources ms ON ms.id=a.source_id
 WHERE a.news_classification='UTAMA' AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0
 AND (SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED'
 AND (a.published_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date
 UNION ALL
 SELECT 'print',pa.id,pa.title,ms.name,pe.edition_date::timestamptz,pa.sentiment,
 COALESCE(NULLIF(pa.ai_metadata->'intelligence'->>'riskLevel',''),CASE WHEN pa.risk_score>=80 THEN 'critical' WHEN pa.risk_score>=60 THEN 'high' WHEN pa.risk_score>=35 THEN 'medium' ELSE 'low' END),pa.risk_score::float
 FROM print_articles pa JOIN opd o ON o.id=pa.opd_id AND o.organization_id=$1 JOIN print_editions pe ON pe.id=pa.edition_id JOIN media_sources ms ON ms.id=pe.source_id
 WHERE lower(pa.status)='analyzed' AND pa.ai_metadata->'v16Routing'->>'routingStatus'='ROUTED' AND COALESCE(pa.ai_metadata->'v16Routing'->>'keywordId','')<>''
 AND pa.ai_metadata->'v16Routing'->>'keywordVerification'='ACCEPTED' AND pa.ai_metadata->'intelligence'->>'riskStatus'='FINAL'
 AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0 AND pe.edition_date=$2::date
 UNION ALL
 SELECT CASE WHEN sm.source_kind='owned' THEN 'owned' ELSE 'social' END,sm.id,COALESCE(sm.title,left(sm.content,240)),COALESCE(osa.account_name,sm.author_name,sm.platform),COALESCE(sm.published_at,sm.captured_at),sm.sentiment,sm.risk_level::text,sm.risk_score::float
 FROM social_mentions sm JOIN opd o ON o.id=sm.opd_id AND o.organization_id=$1 LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
 WHERE sm.content_type NOT IN ('comment','reply') AND sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0 AND (
 (sm.source_kind='external' AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND (sm.metadata->'socialVerification'->>'status'='LOCKED' OR sm.metadata->'manualClassification'->>'locked'='true') AND sm.metadata->'intelligence'->>'riskStatus'='FINAL') OR
 (sm.source_kind='owned' AND sm.curation_status='approved' AND sm.metadata->'v16Routing'->>'verificationStatus'='LOCKED' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND sm.metadata->'intelligence'->>'riskStatus'='FINAL'))
 AND (COALESCE(sm.published_at,sm.captured_at) AT TIME ZONE 'Asia/Jakarta')::date=$2::date
)
SELECT count(*)::int total,count(*) FILTER(WHERE sentiment='positive')::int positive,count(*) FILTER(WHERE sentiment='neutral')::int neutral,count(*) FILTER(WHERE sentiment='negative')::int negative,
 count(*) FILTER(WHERE risk_level IN ('high','critical'))::int high_risk,
 COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM daily ORDER BY published_at DESC NULLS LAST,id DESC LIMIT 48)x),'[]'::jsonb) items FROM daily`;
const riskJoin=`LEFT JOIN LATERAL(SELECT CASE WHEN COALESCE((m.metadata->>'assessed')::boolean,false) THEN m.risk_score ELSE NULL END risk_score FROM issue_metrics m WHERE m.issue_id=i.id ORDER BY m.measured_at DESC,m.id DESC LIMIT 1) risk ON TRUE`;
export const displayIssuesSql=`WITH today AS (
 SELECT i.id,i.title,lower(i.status) status,i.updated_at,i.created_at,risk.risk_score,
 CASE WHEN i.geographic_scope='CITYWIDE' THEN 'Seluruh kota' ELSE COALESCE((SELECT string_agg(d.name,', ' ORDER BY d.name) FROM issue_districts x JOIN districts d ON d.id=x.district_id AND d.organization_id=$1 WHERE x.issue_id=i.id),'Wilayah belum dicatat') END region
 FROM issues i ${riskJoin} WHERE i.organization_id=$1 AND ((i.created_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date OR (i.updated_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date)
) SELECT count(*)::int total,count(*) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date=$2::date)::int new_issues,
 count(*) FILTER(WHERE status='active')::int active,count(*) FILTER(WHERE status='watch')::int watch,
 count(*) FILTER(WHERE status IN ('resolved','archived'))::int resolved,count(*) FILTER(WHERE risk_score>=60)::int high_risk,
 COALESCE((SELECT jsonb_agg(x) FROM (SELECT id,title,status,updated_at,risk_score,region FROM today ORDER BY risk_score DESC NULLS LAST,updated_at DESC,id DESC LIMIT 48)x),'[]'::jsonb) items FROM today`;
export async function readDisplayMap(pool:Pool,org:string,loadBoundary:(key:string)=>Promise<any>=async key=>{const r=await get(key,{access:'private'});if(!r?.stream)throw Error('BOUNDARY_NOT_AVAILABLE');return JSON.parse(await new Response(r.stream).text());}){
 const regions=(await pool.query(`SELECT d.id,d.name,count(DISTINCT i.id)::int total,count(DISTINCT i.id) FILTER(WHERE lower(i.status)='active')::int active,count(DISTINCT i.id) FILTER(WHERE lower(i.status)='watch')::int watch,count(DISTINCT i.id) FILTER(WHERE risk.risk_score>=60)::int high_risk,max(risk.risk_score) risk_score
 FROM districts d LEFT JOIN issue_districts x ON x.district_id=d.id LEFT JOIN issues i ON i.id=x.issue_id AND i.organization_id=$1 AND lower(i.status) IN ('watch','active') ${riskJoin}
 WHERE d.organization_id=$1 AND d.active=true GROUP BY d.id,d.name ORDER BY d.name`,[org])).rows;
 const citywide=(await pool.query(`SELECT i.id,i.title,lower(i.status) status,risk.risk_score FROM issues i ${riskJoin} WHERE i.organization_id=$1 AND i.geographic_scope='CITYWIDE' AND lower(i.status) IN ('watch','active') ORDER BY risk.risk_score DESC NULLS LAST,i.updated_at DESC LIMIT 5`,[org])).rows;
 const totals=(await pool.query(`SELECT count(*)::int total,count(*) FILTER(WHERE lower(i.status)='active')::int active,count(*) FILTER(WHERE lower(i.status)='watch')::int watch,count(*) FILTER(WHERE risk.risk_score>=60)::int high_risk FROM issues i ${riskJoin} WHERE i.organization_id=$1 AND lower(i.status) IN ('watch','active')`,[org])).rows[0]||{};
 const boundary=(await pool.query(`SELECT id,optimized_storage_key FROM organization_map_boundaries WHERE organization_id=$1 AND status='ACTIVE' ORDER BY activated_at DESC NULLS LAST,id DESC LIMIT 1`,[org])).rows[0];
 let geojson:any=null,mapUnavailable=false;
 if(boundary)try{
  const features=(await pool.query('SELECT feature_key,district_id FROM organization_map_boundary_features WHERE boundary_id=$1',[boundary.id])).rows;
  const ids=new Map(features.map(f=>[String(f.feature_key),String(f.district_id)])),geo=await loadBoundary(boundary.optimized_storage_key);
  geojson={type:'FeatureCollection',features:(geo.features||[]).filter((f:any)=>ids.has(String(f.properties?.featureKey))).map((f:any)=>({type:'Feature',properties:{districtId:ids.get(String(f.properties.featureKey))},geometry:f.geometry}))};
 }catch{mapUnavailable=true;}
 return {regions,citywide,totals,geojson,mapUnavailable:mapUnavailable||!geojson};
}
export function createDisplayDataReader(pool:Pool,readMap=readDisplayMap,clock=()=>new Date()){
 const cache=new Map<string,{until:number;value:any;pending?:Promise<any>}>();
 return async(org:string)=>{
  const now=clock(),day=displayDate(now),key=org+':'+day,entry=cache.get(key);
  if(entry&&entry.until>now.getTime())return entry.pending??entry.value;
  const pending=(async()=>{const [news,issues,map,brand]=await Promise.all([pool.query(displayNewsSql,[org,day]),pool.query(displayIssuesSql,[org,day]),readMap(pool,org),pool.query('SELECT government_name,short_name FROM government_branding WHERE is_active=true ORDER BY id DESC LIMIT 1')]);
   return {date:day,generatedAt:now.toISOString(),branding:brand.rows[0]||{},news:news.rows[0]||{total:0,items:[]},issues:issues.rows[0]||{total:0,items:[]},map};})();
  if(cache.size>=8)cache.delete(cache.keys().next().value!);
  cache.set(key,{until:now.getTime()+300000,value:null,pending});
  try{const value=await pending;cache.set(key,{until:now.getTime()+300000,value});return value;}catch(e){cache.delete(key);throw e;}
 };
}
