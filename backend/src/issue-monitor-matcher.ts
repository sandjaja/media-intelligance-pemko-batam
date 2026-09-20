import type { Pool } from 'pg';

export type IssueMonitorSource = 'online'|'print'|'social'|'owned';
export type IssueMonitorMatchType = 'DIRECT'|'CONTEXT';

export type IssueMonitorInput = {
  sourceType: IssueMonitorSource;
  publishedAt?: Date|string|null;
  title?: string|null;
  content?: string|null;
  taxonomyId?: number|null;
};

export type IssueMonitorMatch = {
  monitorId: number;
  issueId: number;
  monitorName: string;
  matchedTerms: string[];
  relevanceScore: number;
};

const normalize=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const hasTerm=(haystack:string,term:string)=>{const h=' '+normalize(haystack)+' ',t=normalize(term);return !!t&&h.includes(' '+t+' ');};

export async function matchActiveIssueMonitors(pool:Pool,input:IssueMonitorInput):Promise<IssueMonitorMatch[]>{
  const published=input.publishedAt?new Date(input.publishedAt):new Date();
  if(Number.isNaN(published.getTime()))return[];
  const {rows}=await pool.query(
    `SELECT m.id monitor_id,m.issue_id,m.name,i.taxonomy_category_id,
            array_agg(t.term ORDER BY t.id) FILTER (WHERE t.active=true) terms
       FROM issue_monitors m
       JOIN issues i ON i.id=m.issue_id
       JOIN issue_monitor_sources s ON s.monitor_id=m.id AND s.source_type=$1
       JOIN issue_monitor_terms t ON t.monitor_id=m.id AND t.active=true
      WHERE m.status='watching'
        AND $2::timestamptz BETWEEN m.starts_at AND m.ends_at
      GROUP BY m.id,m.issue_id,m.name,i.taxonomy_category_id`,
    [input.sourceType,published]
  );
  const title=String(input.title||''),body=String(input.content||''),all=title+' '+body;
  const matches:IssueMonitorMatch[]=[];
  for(const row of rows){
    if(row.taxonomy_category_id!=null&&input.taxonomyId!=null&&Number(row.taxonomy_category_id)!==Number(input.taxonomyId))continue;
    const terms=(row.terms||[]).map(String);
    const matched=terms.filter(term=>hasTerm(all,term));
    if(!matched.length)continue;
    const titleHits=matched.filter(term=>hasTerm(title,term)).length;
    matches.push({monitorId:Number(row.monitor_id),issueId:Number(row.issue_id),monitorName:String(row.name),matchedTerms:matched,relevanceScore:Math.min(100,60+titleHits*20+Math.max(0,matched.length-titleHits)*10)});
  }
  return matches;
}

export async function linkSocialMentionToIssueMonitors(pool:Pool,args:{mentionId:number;sourceKind?:string|null;publishedAt?:Date|string|null;title?:string|null;content?:string|null;taxonomyId?:number|null;}){
  const sourceType:IssueMonitorSource=args.sourceKind==='owned'?'owned':'social';
  const matches=await matchActiveIssueMonitors(pool,{sourceType,publishedAt:args.publishedAt,title:args.title,content:args.content,taxonomyId:args.taxonomyId});
  for(const match of matches){
    await pool.query(
      `INSERT INTO social_mention_issues(mention_id,issue_id,relevance_score,linkage_source)
       VALUES($1,$2,$3,'ISSUE_MONITOR')
       ON CONFLICT(mention_id,issue_id) DO UPDATE
       SET relevance_score=GREATEST(social_mention_issues.relevance_score,EXCLUDED.relevance_score),
           linkage_source=CASE WHEN social_mention_issues.linkage_source='MANUAL' THEN social_mention_issues.linkage_source ELSE EXCLUDED.linkage_source END`,
      [args.mentionId,match.issueId,match.relevanceScore]
    ).catch(()=>undefined);
  }
  return matches;
}
