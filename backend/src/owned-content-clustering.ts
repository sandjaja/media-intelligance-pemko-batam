import type { Pool, PoolClient } from 'pg';

type Mention = {
  id: string;
  owned_account_id: string | null;
  account_name: string | null;
  account_handle: string | null;
  profile_url: string | null;
  title: string | null;
  content: string | null;
  published_at: string | null;
  captured_at: string | null;
};

type MemberType = 'identical' | 'adapted' | 'unique';
type WorkingMember = { mention: Mention; score: number; type: MemberType };
type WorkingCluster = { representative: Mention; members: WorkingMember[] };

const STOPWORDS = new Set(['dan','yang','di','ke','dari','untuk','pada','dengan','atau','ini','itu','dalam','atas','sebagai','oleh','kota','batam','pemko','pemerintah']);
const PRIMARY_NEWSROOM_HOST = 'mediacenter.batam.go.id';

function normalize(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function tokens(value: string | null | undefined,max=320){return normalize(value).split(' ').filter(x=>x.length>2&&!STOPWORDS.has(x)).slice(0,max)}
function jaccard(a:string[],b:string[]){const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}
function shingles(value:string|null|undefined,size=5,max=500){const t=tokens(value,max);const out:string[]=[];for(let i=0;i<=t.length-size;i++)out.push(t.slice(i,i+size).join(' '));return out}
function dateMs(m:Mention){const raw=m.published_at||m.captured_at;if(!raw)return Number.MAX_SAFE_INTEGER;const n=new Date(raw).getTime();return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER}
function signals(a:Mention,b:Mention){const title=jaccard(tokens(a.title,50),tokens(b.title,50));const body=jaccard(tokens(a.content,320),tokens(b.content,320));const phrase=jaccard(shingles(a.content),shingles(b.content));const score=Math.max(title,body*0.92,phrase,0.30*title+0.70*body);return{title,body,phrase,score:Math.max(0,Math.min(1,score))}}
function classify(s:ReturnType<typeof signals>):MemberType{if(s.title>=0.88||(s.body>=0.88&&s.phrase>=0.72))return'identical';if(s.score>=0.56||s.body>=0.60||s.phrase>=0.32)return'adapted';return'unique'}
function sourcePriority(m:Mention){
  const handle=String(m.account_handle||'').toLowerCase();
  const profile=String(m.profile_url||'').toLowerCase();
  const name=String(m.account_name||'').toLowerCase();
  if(handle===PRIMARY_NEWSROOM_HOST||profile.includes(PRIMARY_NEWSROOM_HOST)||name.includes('media center batam'))return 0;
  return 10;
}
function chooseOriginal(members:WorkingMember[]){return members.slice().sort((a,b)=>sourcePriority(a.mention)-sourcePriority(b.mention)||dateMs(a.mention)-dateMs(b.mention)||Number(a.mention.id)-Number(b.mention.id))[0].mention}
function finalizeCluster(cluster:WorkingCluster){const original=chooseOriginal(cluster.members);cluster.representative=original;cluster.members=cluster.members.map(m=>{if(m.mention.id===original.id)return{...m,score:1,type:'unique' as const};const s=signals(m.mention,original);return{...m,score:s.score,type:classify(s)}})}

async function persist(client:PoolClient,clusters:WorkingCluster[]){
  await client.query('DELETE FROM owned_content_cluster_members');await client.query('DELETE FROM owned_content_clusters');
  for(const cluster of clusters){finalizeCluster(cluster);const times=cluster.members.map(x=>x.mention.published_at).filter(Boolean).map(String).map(x=>new Date(x)).filter(x=>!Number.isNaN(x.getTime())).sort((a,b)=>a.getTime()-b.getTime());const accountIds=new Set(cluster.members.map(x=>x.mention.owned_account_id).filter(Boolean));const{rows}=await client.query(`INSERT INTO owned_content_clusters(canonical_title,representative_mention_id,member_count,channel_count,first_published_at,last_published_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[cluster.representative.title,cluster.representative.id,cluster.members.length,accountIds.size,times[0]?.toISOString()||null,times.at(-1)?.toISOString()||null]);const clusterId=rows[0].id;for(const member of cluster.members)await client.query(`INSERT INTO owned_content_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by) VALUES($1,$2,$3,$4,'rule-v1.1')`,[clusterId,member.mention.id,member.score,member.type]);}
}

export async function rebuildOwnedContentClusters(pool:Pool){
  const{rows}=await pool.query<Mention>(`SELECT sm.id,sm.owned_account_id,osa.account_name,osa.handle AS account_handle,osa.profile_url,sm.title,sm.content,sm.published_at,sm.captured_at FROM social_mentions sm LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id WHERE sm.source_kind='owned' ORDER BY sm.published_at ASC NULLS LAST,sm.captured_at ASC,sm.id ASC LIMIT 1000`);
  const clusters:WorkingCluster[]=[];
  for(const mention of rows){let best:WorkingCluster|null=null,bestSignals:ReturnType<typeof signals>|null=null;for(const cluster of clusters){const s=signals(mention,cluster.representative);if(!bestSignals||s.score>bestSignals.score){best=cluster;bestSignals=s}}const kind=bestSignals?classify(bestSignals):'unique';if(best&&bestSignals&&kind!=='unique')best.members.push({mention,score:bestSignals.score,type:kind});else clusters.push({representative:mention,members:[{mention,score:1,type:'unique'}]});}
  const client=await pool.connect();try{await client.query('BEGIN');await persist(client,clusters);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  return{mentions:rows.length,clusters:clusters.length,republished:clusters.filter(c=>c.members.length>1).length,maxChannels:clusters.reduce((m,c)=>Math.max(m,new Set(c.members.map(x=>x.mention.owned_account_id).filter(Boolean)).size),0),engine:'owned-content-rule-v1.1-primary-source'};
}
