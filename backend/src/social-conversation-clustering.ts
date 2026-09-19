import type { Pool } from 'pg';
type SocialConversationItem={
  id:string; platform:string|null; title:string|null; content:string|null;
  published_at:string|null; captured_at:string|null; sentiment?:string|null;
  risk_level?:string|null; metadata:any;
};
export type SocialConversationCluster={key:string;taxonomyId:string;taxonomyName:string;keywordId:string|null;keyword:string|null;mentions:SocialConversationItem[];platforms:string[];negative:number;highRisk:number};
const routing=(x:SocialConversationItem)=>x.metadata?.v16Routing||{};
const clean=(v:unknown)=>String(v??'').trim();
/** Social adapter: V16.5 supplies semantic evidence; no Social-only dictionary. */
const stopwords=new Set(['yang','dan','di','ke','dari','untuk','dengan','pada','ini','itu','atau','oleh','akan','telah','dalam','sebagai','agar','karena','saat','para','kota','pemerintah']);
const tokens=(x:SocialConversationItem)=>{const sc=x.metadata?.socialContext||{};const text=[x.title,x.content,sc.parentComment?.title,sc.parentComment?.content,sc.parentContent?.title,sc.parentContent?.content].filter(Boolean).join(' ').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\u00c0-\u024f]+/g,' ');return new Set(text.split(/\s+/).filter((t:string)=>t.length>=4&&!stopwords.has(t)))};
const similarity=(a:Set<string>,b:Set<string>)=>{if(!a.size||!b.size)return 0;let common=0;for(const x of a)if(b.has(x))common++;return common/Math.min(a.size,b.size)};
const timeOf=(x:SocialConversationItem)=>Date.parse(x.published_at||x.captured_at||'')||0;
/** Social adapter: V16.5 is a semantic gate; lexical + parent context separates/merges actual conversations. */
export function clusterSocialConversations(rows:SocialConversationItem[]):SocialConversationCluster[]{
  const eligible=rows.filter(row=>{const r=routing(row);return r.routingStatus==='ROUTED'&&clean(r.taxonomyId)&&clean(r.taxonomyName)}).sort((a,b)=>timeOf(a)-timeOf(b));
  const groups:SocialConversationCluster[]=[];
  for(const row of eligible){
    const r=routing(row),taxonomyId=clean(r.taxonomyId),taxonomyName=clean(r.taxonomyName),keywordId=clean(r.keywordId)||null,keyword=clean(r.keyword)||null,rowTokens=tokens(row);
    let best:SocialConversationCluster|undefined,bestScore=0;
    for(const g of groups){
      const age=Math.abs(timeOf(row)-Math.max(...g.mentions.map(timeOf)));if(age>72*3600_000)continue;
      const sameTaxonomy=g.taxonomyId===taxonomyId,sameKeyword=Boolean(keywordId&&g.keywordId===keywordId);
      const score=Math.max(...g.mentions.map(m=>similarity(rowTokens,tokens(m))));
      if((sameKeyword&&score>=0.18)||(sameTaxonomy&&score>=0.30)){const weighted=score+(sameKeyword?.15:0);if(weighted>bestScore){best=g;bestScore=weighted;}}
    }
    if(!best){best={key:taxonomyId+':'+(keywordId||'taxonomy')+':'+row.id,taxonomyId,taxonomyName,keywordId,keyword,mentions:[],platforms:[],negative:0,highRisk:0};groups.push(best);}
    best.mentions.push(row);if(row.platform&&!best.platforms.includes(row.platform))best.platforms.push(row.platform);if(row.sentiment==='negative')best.negative++;if(row.risk_level==='high'||row.risk_level==='critical')best.highRisk++;
  }
  return groups.sort((a,b)=>b.mentions.length-a.mentions.length||b.highRisk-a.highRisk||b.negative-a.negative);
}

const ENGINE='social-conversation-v2';

export async function persistSocialConversationClusters(pool:Pool,organizationId:string|number,days=7){
  const {rows}=await pool.query<SocialConversationItem>(`SELECT id::text,platform,title,content,published_at,captured_at,sentiment,risk_level,metadata FROM social_mentions sm WHERE sm.source_kind='external' AND COALESCE(sm.published_at,sm.captured_at)>=NOW()-($1::int*INTERVAL '1 day') AND NOT EXISTS(SELECT 1 FROM social_conversation_manual_exclusions e WHERE e.mention_id=sm.id) AND NOT EXISTS(SELECT 1 FROM social_conversation_cluster_members cm WHERE cm.mention_id=sm.id AND cm.assignment_mode='MANUAL') AND EXISTS(SELECT 1 FROM opd o WHERE o.id=sm.opd_id AND o.organization_id=$2) ORDER BY COALESCE(sm.published_at,sm.captured_at),sm.id`,[days,organizationId]);
  const groups=clusterSocialConversations(rows);let attached=0,created=0,moved=0;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const system=(await client.query(`SELECT c.id,c.keyword_id,ARRAY_REMOVE(ARRAY_AGG(cm.mention_id::text),NULL) member_ids FROM social_conversation_clusters c LEFT JOIN social_conversation_cluster_members cm ON cm.cluster_id=c.id AND cm.assignment_mode='SYSTEM' WHERE c.organization_id=$1 AND c.status='ACTIVE' AND c.origin_mode='SYSTEM' GROUP BY c.id,c.keyword_id`,[organizationId])).rows;
    const claimed=new Set<string>();
    for(const group of groups){
      // Same Master Keyword is the hard semantic gate. Existing SYSTEM cluster is
      // reconciled by member overlap, allowing several conversations per keyword.
      const memberIds=new Set(group.mentions.map(m=>String(m.id)));
      const candidates=system.filter((x:any)=>String(x.keyword_id??'')===String(group.keywordId??'')&&!claimed.has(String(x.id)));
      let existing:any=null,bestOverlap=0;
      for(const candidate of candidates){
        const overlap=(candidate.member_ids||[]).reduce((n:number,id:string)=>n+(memberIds.has(String(id))?1:0),0);
        if(overlap>bestOverlap){existing=candidate;bestOverlap=overlap;}
      }
      // No overlap means this is a distinct conversation even with the same keyword.
      let clusterId=existing?.id;
      if(!clusterId){
        const ins=await client.query(`INSERT INTO social_conversation_clusters(organization_id,canonical_title,taxonomy_id,keyword_id,representative_mention_id,engine_version,origin_mode) VALUES($1,$2,$3,$4,$5,$6,'SYSTEM') RETURNING id`,[organizationId,group.keyword||group.taxonomyName,group.taxonomyId,group.keywordId,group.mentions[0]?.id??null,ENGINE]);
        clusterId=ins.rows[0].id;created++;
      }
      claimed.add(String(clusterId));
      for(const mention of group.mentions){
        const current=(await client.query(`SELECT cm.cluster_id,cm.assignment_mode,c.organization_id FROM social_conversation_cluster_members cm JOIN social_conversation_clusters c ON c.id=cm.cluster_id WHERE cm.mention_id=$1`,[mention.id])).rows[0];
        if(current?.assignment_mode==='MANUAL')continue;
        if(current&&String(current.organization_id)!==String(organizationId))continue;
        if(current&&String(current.cluster_id)!==String(clusterId)){await client.query(`DELETE FROM social_conversation_cluster_members WHERE mention_id=$1 AND assignment_mode='SYSTEM'`,[mention.id]);moved++;}
        const result=await client.query(`INSERT INTO social_conversation_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'semantic',$3,'SYSTEM') ON CONFLICT(mention_id) DO NOTHING RETURNING mention_id`,[clusterId,mention.id,ENGINE+':v16.5']);
        attached+=result.rowCount??0;
      }
    }
    await client.query(`UPDATE social_conversation_clusters c SET member_count=x.member_count,platform_count=x.platform_count,representative_mention_id=x.representative_mention_id,first_published_at=x.first_published_at,last_published_at=x.last_published_at,engine_version=$2,status='ACTIVE',updated_at=NOW() FROM (SELECT cm.cluster_id,COUNT(*)::int member_count,COUNT(DISTINCT sm.platform)::int platform_count,(ARRAY_AGG(sm.id ORDER BY COALESCE(sm.published_at,sm.captured_at),sm.id))[1] representative_mention_id,MIN(COALESCE(sm.published_at,sm.captured_at)) first_published_at,MAX(COALESCE(sm.published_at,sm.captured_at)) last_published_at FROM social_conversation_cluster_members cm JOIN social_mentions sm ON sm.id=cm.mention_id GROUP BY cm.cluster_id)x WHERE c.id=x.cluster_id AND c.organization_id=$1 AND c.origin_mode='SYSTEM'`,[organizationId,ENGINE]);
    await client.query(`UPDATE social_conversation_clusters c SET member_count=0,platform_count=0,representative_mention_id=NULL,first_published_at=NULL,last_published_at=NULL,status='ARCHIVED',updated_at=NOW() WHERE c.organization_id=$1 AND c.origin_mode='SYSTEM' AND c.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM social_conversation_cluster_members cm WHERE cm.cluster_id=c.id)`,[organizationId]);
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return{mentions:rows.length,groups:groups.length,attached,created,moved,engine:ENGINE};
}
