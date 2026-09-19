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
export function clusterSocialConversations(rows:SocialConversationItem[]):SocialConversationCluster[]{
  const groups=new Map<string,SocialConversationCluster>();
  for(const row of rows){
    const r=routing(row); if(r.routingStatus!=='ROUTED')continue;
    const taxonomyId=clean(r.taxonomyId),taxonomyName=clean(r.taxonomyName); if(!taxonomyId||!taxonomyName)continue;
    const keywordId=clean(r.keywordId)||null,keyword=clean(r.keyword)||null;
    const key=taxonomyId+':'+(keywordId||'taxonomy');
    let g=groups.get(key);
    if(!g){g={key,taxonomyId,taxonomyName,keywordId,keyword,mentions:[],platforms:[],negative:0,highRisk:0};groups.set(key,g);}
    g.mentions.push(row);
    if(row.platform&&!g.platforms.includes(row.platform))g.platforms.push(row.platform);
    if(row.sentiment==='negative')g.negative++;
    if(row.risk_level==='high'||row.risk_level==='critical')g.highRisk++;
  }
  return [...groups.values()].sort((a,b)=>b.mentions.length-a.mentions.length||b.highRisk-a.highRisk||b.negative-a.negative);
}


const ENGINE='social-conversation-v1';

export async function persistSocialConversationClusters(pool:Pool,organizationId:string|number,days=7){
  const {rows}=await pool.query<SocialConversationItem>(`SELECT id::text,platform,title,content,published_at,captured_at,sentiment,risk_level,metadata FROM social_mentions sm WHERE sm.source_kind='external' AND COALESCE(sm.published_at,sm.captured_at)>=NOW()-($1::int*INTERVAL '1 day') AND NOT EXISTS(SELECT 1 FROM social_conversation_manual_exclusions e WHERE e.mention_id=sm.id) AND NOT EXISTS(SELECT 1 FROM social_conversation_cluster_members cm WHERE cm.mention_id=sm.id AND cm.assignment_mode='MANUAL') ORDER BY COALESCE(sm.published_at,sm.captured_at),sm.id`,[days]);
  const groups=clusterSocialConversations(rows);let attached=0,created=0;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const group of groups){
      const existing=(await client.query(`SELECT id FROM social_conversation_clusters WHERE organization_id=$1 AND status='ACTIVE' AND origin_mode='SYSTEM' AND taxonomy_id=$2 AND keyword_id IS NOT DISTINCT FROM $3 ORDER BY updated_at DESC LIMIT 1`,[organizationId,group.taxonomyId,group.keywordId])).rows[0];
      let clusterId=existing?.id;
      if(!clusterId){
        const ins=await client.query(`INSERT INTO social_conversation_clusters(organization_id,canonical_title,taxonomy_id,keyword_id,representative_mention_id,engine_version,origin_mode) VALUES($1,$2,$3,$4,$5,$6,'SYSTEM') RETURNING id`,[organizationId,group.keyword||group.taxonomyName,group.taxonomyId,group.keywordId,group.mentions[0]?.id??null,ENGINE]);
        clusterId=ins.rows[0].id;created++;
      }
      for(const mention of group.mentions){
        const result=await client.query(`INSERT INTO social_conversation_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'semantic',$3,'SYSTEM') ON CONFLICT(mention_id) DO NOTHING RETURNING mention_id`,[clusterId,mention.id,ENGINE+':v16.5']);
        attached+=result.rowCount??0;
      }
      await client.query(`UPDATE social_conversation_clusters c SET member_count=x.member_count,platform_count=x.platform_count,representative_mention_id=COALESCE(c.representative_mention_id,x.representative_mention_id),first_published_at=x.first_published_at,last_published_at=x.last_published_at,engine_version=$2,updated_at=NOW() FROM (SELECT cm.cluster_id,COUNT(*)::int member_count,COUNT(DISTINCT sm.platform)::int platform_count,(ARRAY_AGG(sm.id ORDER BY COALESCE(sm.published_at,sm.captured_at),sm.id))[1] representative_mention_id,MIN(COALESCE(sm.published_at,sm.captured_at)) first_published_at,MAX(COALESCE(sm.published_at,sm.captured_at)) last_published_at FROM social_conversation_cluster_members cm JOIN social_mentions sm ON sm.id=cm.mention_id WHERE cm.cluster_id=$1 GROUP BY cm.cluster_id)x WHERE c.id=x.cluster_id`,[clusterId,ENGINE]);
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return{mentions:rows.length,groups:groups.length,attached,created,engine:ENGINE};
}
