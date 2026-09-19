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
