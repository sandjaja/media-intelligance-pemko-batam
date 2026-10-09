import type { Pool, PoolClient } from 'pg';
type Db=Pick<Pool,'query'>|Pick<PoolClient,'query'>;

export type UnifiedIssueEvidence = {
  title?: string|null;
  summary?: string|null;
  content?: string|null;
  opdId?: number|null;
  taxonomyName?: string|null;
  keywords?: string[];
  primaryKeyword?: string|null;
};

export type UnifiedExistingIssueMatch = {
  issueId:number;
  title:string;
  status:string;
  score:number;
  confidence:'LOW'|'MEDIUM'|'HIGH';
  evidence:string[];
};

const ENGINE='unified-existing-issue-v4-primary-keyword-hard-gate';
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const GENERIC=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','pemerintah','dinas','kota','daerah','olahraga','kepemudaan','pemuda','atlet','prestasi','program','kegiatan','provinsi']);
const specific=(v:string)=>{const n=norm(v);return n.length>=4&&/[a-z]/.test(n)&&!GENERIC.has(n)&&!['sport','tourism'].includes(n);};
const tokens=(v:any)=>new Set(norm(v).split(' ').filter(specific));
const overlap=(a:Set<string>,b:Set<string>)=>[...a].filter(x=>b.has(x));
const confidence=(s:number):'LOW'|'MEDIUM'|'HIGH'=>s>=70?'HIGH':s>=40?'MEDIUM':'LOW';

export async function matchExistingIssues(client:Db,organizationId:number,e:UnifiedIssueEvidence){
  const issues=await client.query(`SELECT i.id,i.title,i.description,i.status,tc.name taxonomy_name,COALESCE(array_agg(DISTINCT io.opd_id) FILTER (WHERE io.opd_id IS NOT NULL),'{}') AS opd_ids,COALESCE(array_agg(DISTINCT k.keyword) FILTER (WHERE k.keyword IS NOT NULL),'{}') AS taxonomy_keywords,(SELECT x.keyword FROM (SELECT uci.snapshot->>'primaryKeyword' keyword,110 priority,0::bigint id FROM unified_candidate_issues uci WHERE uci.issue_id=i.id AND uci.status IN ('APPROVED','MERGED') AND NULLIF(uci.snapshot->>'primaryKeyword','') IS NOT NULL UNION ALL SELECT k2.keyword,CASE WHEN amk.keyword_role='PRIMARY' THEN 100 WHEN amk.keyword_role IS NULL THEN 90 ELSE 0 END priority,k2.id FROM issue_articles ia JOIN article_manual_keywords amk ON amk.article_id=ia.article_id AND amk.active=true JOIN keywords k2 ON k2.id=amk.keyword_id AND k2.active=true WHERE ia.issue_id=i.id AND (amk.keyword_role='PRIMARY' OR amk.keyword_role IS NULL) UNION ALL SELECT COALESCE(NULLIF(pa.ai_metadata->'phase2e'->'manualPrimaryKeyword'->>'keyword',''),k2.keyword,pa.ai_metadata->'v16Routing'->>'keyword'),95,COALESCE(k2.id,0) FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id LEFT JOIN keywords k2 ON k2.id::text=COALESCE(pa.ai_metadata->'phase2e'->'manualPrimaryKeyword'->>'keywordId',pa.ai_metadata->'v16Routing'->>'keywordId') AND k2.active=true WHERE ipa.issue_id=i.id AND ipa.linkage_status='linked' AND COALESCE(NULLIF(pa.ai_metadata->'phase2e'->'manualPrimaryKeyword'->>'keyword',''),k2.keyword,pa.ai_metadata->'v16Routing'->>'keyword') IS NOT NULL UNION ALL SELECT k2.keyword,80,k2.id FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id JOIN keywords k2 ON k2.id::text=COALESCE(sm.metadata->'manualClassification'->>'keywordId',sm.metadata->'v16Routing'->>'keywordId') AND k2.active=true WHERE smi.issue_id=i.id) x ORDER BY x.priority DESC,x.id LIMIT 1) primary_keyword FROM issues i LEFT JOIN issue_opd io ON io.issue_id=i.id LEFT JOIN taxonomy_categories tc ON tc.id=i.taxonomy_category_id LEFT JOIN keyword_taxonomy kt ON kt.category_id=i.taxonomy_category_id AND kt.active=true LEFT JOIN keywords k ON k.id=kt.keyword_id AND k.active=true WHERE i.organization_id=$1 AND i.status IN ('active','watch','resolved','archived') GROUP BY i.id,tc.name ORDER BY i.updated_at DESC LIMIT 100`,[organizationId]);
  const articleWords=tokens(`${e.title||''} ${e.summary||''} ${e.content||''}`);
  const articleKeywords=new Set((e.keywords||[]).map(norm).filter(Boolean));
  const incomingPrimary=norm(e.primaryKeyword||'')||[...articleKeywords].find(specific)||'';
  const out:UnifiedExistingIssueMatch[]=[];
  if(!incomingPrimary)return {engine:ENGINE,matches:[],historicalMatches:[],primaryKeywordGuard:true};
  for(const issue of issues.rows){
    const issuePrimary=norm(issue.primary_keyword||'');
    // Primary Keyword is the identity gate. Taxonomy/OPD are routing metadata,
    // never evidence that two records belong to the same Issue.
    if(!issuePrimary||issuePrimary!==incomingPrimary)continue;
    let score=40; const reasons:string[]=[`Primary Keyword sama: ${incomingPrimary}`];
    const issueText=norm(`${issue.title||''} ${issue.description||''}`);
    const issueTitleWords=tokens(issue.title||'');
    const sharedSpecific=overlap(articleWords,tokens(issueText)).filter(x=>x!==incomingPrimary);
    const titleAnchors=[...issueTitleWords].filter(w=>articleWords.has(w)&&w!==incomingPrimary);
    if(titleAnchors.length){score+=Math.min(40,titleAnchors.length*20);reasons.push(`Anchor kasus/judul sama: ${titleAnchors.slice(0,4).join(', ')}`);}
    if(sharedSpecific.length){score+=Math.min(20,sharedSpecific.length*5);reasons.push(`Konteks kasus serupa: ${sharedSpecific.slice(0,4).join(', ')}`);}
    score=Math.min(100,score);
    out.push({issueId:Number(issue.id),title:String(issue.title),status:String(issue.status),score,confidence:confidence(score),evidence:reasons});
  }
  const sorted=out.sort((a,b)=>b.score-a.score);
  const live=sorted.filter(x=>x.status==='active'||x.status==='watch');
  const historical=sorted.filter(x=>x.status==='resolved'||x.status==='archived');
  return {engine:ENGINE,matches:live.slice(0,3),historicalMatches:historical.slice(0,3),primaryKeywordGuard:true};
}
