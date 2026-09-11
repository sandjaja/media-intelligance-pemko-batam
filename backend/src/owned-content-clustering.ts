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
type Features = { title:string[]; body:string[]; phrases:string[] };
type SimilaritySignals = { title:number; body:number; bodyContain:number; phrase:number; phraseContain:number; score:number };

const STOPWORDS = new Set(['dan','yang','di','ke','dari','untuk','pada','dengan','atau','ini','itu','dalam','atas','sebagai','oleh','kota','batam','pemko','pemerintah']);
const PRIMARY_NEWSROOM_HOST = 'mediacenter.batam.go.id';

function normalize(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function tokens(value:string|null|undefined,max=420){return normalize(value).split(' ').filter(x=>x.length>2&&!STOPWORDS.has(x)).slice(0,max)}
function shingles(value:string|null|undefined,size=5,max=600){const t=tokens(value,max),out:string[]=[];for(let i=0;i<=t.length-size;i++)out.push(t.slice(i,i+size).join(' '));return out}
function overlap(a:string[],b:string[]){const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return{jaccard:0,containment:0};let n=0;for(const x of A)if(B.has(x))n++;return{jaccard:n/(A.size+B.size-n),containment:n/Math.min(A.size,B.size)}}
function features(m:Mention):Features{return{title:tokens(m.title,60),body:tokens(m.content,420),phrases:shingles(m.content)}}
function dateMs(m:Mention){const raw=m.published_at||m.captured_at;if(!raw)return Number.MAX_SAFE_INTEGER;const n=new Date(raw).getTime();return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER}
function sourcePriority(m:Mention){const handle=String(m.account_handle||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');const profile=String(m.profile_url||'').toLowerCase();const name=String(m.account_name||'').toLowerCase();if(handle===PRIMARY_NEWSROOM_HOST||handle.startsWith(PRIMARY_NEWSROOM_HOST+'/')||profile.includes(PRIMARY_NEWSROOM_HOST)||name.includes('media center batam'))return 0;return 10}
function signalsFromFeatures(a:Features,b:Features):SimilaritySignals{const title=overlap(a.title,b.title),body=overlap(a.body,b.body),phrase=overlap(a.phrases,b.phrases);const score=Math.max(title.jaccard,body.jaccard*0.92,body.containment*0.82,phrase.jaccard,phrase.containment*0.92,0.25*title.jaccard+0.75*body.jaccard);return{title:title.jaccard,body:body.jaccard,bodyContain:body.containment,phrase:phrase.jaccard,phraseContain:phrase.containment,score:Math.max(0,Math.min(1,score))}}
function classify(s:SimilaritySignals):MemberType{if(s.title>=0.88||(s.body>=0.88&&s.phraseContain>=0.70))return'identical';if(s.score>=0.54||s.body>=0.52||s.bodyContain>=0.60||s.phraseContain>=0.24)return'adapted';return'unique'}
function chooseOriginal(members:WorkingMember[]){return members.slice().sort((a,b)=>sourcePriority(a.mention)-sourcePriority(b.mention)||dateMs(a.mention)-dateMs(b.mention)||Number(a.mention.id)-Number(b.mention.id))[0].mention}
function bestSignalsAgainstCluster(mention:Mention,cluster:WorkingCluster,cache:Map<string,Features>){const mf=cache.get(mention.id)!;let best:SimilaritySignals|null=null;for(const member of cluster.members){const s=signalsFromFeatures(mf,cache.get(member.mention.id)!);if(!best||s.score>best.score)best=s}return best}
function clusterLink(a:WorkingCluster,b:WorkingCluster,cache:Map<string,Features>){let best:SimilaritySignals|null=null;for(const ma of a.members)for(const mb of b.members){const s=signalsFromFeatures(cache.get(ma.mention.id)!,cache.get(mb.mention.id)!);if(!best||s.score>best.score)best=s;if(classify(s)!=='unique')return s}return best}
function finalizeCluster(cluster:WorkingCluster,cache:Map<string,Features>){const original=chooseOriginal(cluster.members);cluster.representative=original;cluster.members=cluster.members.map(m=>{if(m.mention.id===original.id)return{...m,score:1,type:'unique' as const};const s=signalsFromFeatures(cache.get(m.mention.id)!,cache.get(original.id)!);let type=classify(s);if(type==='unique'){let best:SimilaritySignals|null=null;for(const peer of cluster.members){if(peer.mention.id===m.mention.id)continue;const p=signalsFromFeatures(cache.get(m.mention.id)!,cache.get(peer.mention.id)!);if(!best||p.score>best.score)best=p}if(best&&classify(best)!=='unique'){type=classify(best);return{...m,score:best.score,type}}}return{...m,score:s.score,type}})}

async function persist(client:PoolClient,clusters:WorkingCluster[],cache:Map<string,Features>){await client.query('DELETE FROM owned_content_cluster_members');await client.query('DELETE FROM owned_content_clusters');for(const cluster of clusters){finalizeCluster(cluster,cache);const times=cluster.members.map(x=>x.mention.published_at).filter(Boolean).map(String).map(x=>new Date(x)).filter(x=>!Number.isNaN(x.getTime())).sort((a,b)=>a.getTime()-b.getTime());const accountIds=new Set(cluster.members.map(x=>x.mention.owned_account_id).filter(Boolean));const{rows}=await client.query(`INSERT INTO owned_content_clusters(canonical_title,representative_mention_id,member_count,channel_count,first_published_at,last_published_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[cluster.representative.title,cluster.representative.id,cluster.members.length,accountIds.size,times[0]?.toISOString()||null,times.at(-1)?.toISOString()||null]);const clusterId=rows[0].id;for(const member of cluster.members)await client.query(`INSERT INTO owned_content_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by) VALUES($1,$2,$3,$4,'rule-v1.2')`,[clusterId,member.mention.id,member.score,member.type]);}}

export async function rebuildOwnedContentClusters(pool:Pool){
  const{rows}=await pool.query<Mention>(`SELECT sm.id,sm.owned_account_id,osa.account_name,osa.handle AS account_handle,osa.profile_url,sm.title,sm.content,sm.published_at,sm.captured_at FROM social_mentions sm LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id WHERE sm.source_kind='owned' ORDER BY sm.published_at ASC NULLS LAST,sm.captured_at ASC,sm.id ASC LIMIT 1000`);
  const cache=new Map<string,Features>();for(const mention of rows)cache.set(mention.id,features(mention));
  const clusters:WorkingCluster[]=[];
  for(const mention of rows){let best:WorkingCluster|null=null,bestSignals:SimilaritySignals|null=null;for(const cluster of clusters){const s=bestSignalsAgainstCluster(mention,cluster,cache);if(s&&(!bestSignals||s.score>bestSignals.score)){best=cluster;bestSignals=s}}const kind=bestSignals?classify(bestSignals):'unique';if(best&&bestSignals&&kind!=='unique')best.members.push({mention,score:bestSignals.score,type:kind});else clusters.push({representative:mention,members:[{mention,score:1,type:'unique'}]});}
  let merged=true;while(merged){merged=false;outer:for(let i=0;i<clusters.length;i++){for(let j=i+1;j<clusters.length;j++){const link=clusterLink(clusters[i],clusters[j],cache);if(link&&classify(link)!=='unique'){clusters[i].members.push(...clusters[j].members);clusters.splice(j,1);merged=true;break outer}}}}
  for(const cluster of clusters)finalizeCluster(cluster,cache);
  const client=await pool.connect();try{await client.query('BEGIN');await persist(client,clusters,cache);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  return{mentions:rows.length,clusters:clusters.length,republished:clusters.filter(c=>c.members.length>1).length,maxChannels:clusters.reduce((m,c)=>Math.max(m,new Set(c.members.map(x=>x.mention.owned_account_id).filter(Boolean)).size),0),engine:'owned-content-rule-v1.2-primary-newsroom'};
}
