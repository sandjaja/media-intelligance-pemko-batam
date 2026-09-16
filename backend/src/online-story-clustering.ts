import type { Pool, PoolClient } from 'pg';

type Article={id:string;source_id:string|null;source_name:string|null;title:string|null;summary:string|null;content:string|null;published_at:string|null;created_at:string|null};
type MemberType='representative'|'identical'|'similar';
type WorkingMember={article:Article;score:number;type:MemberType};
type WorkingCluster={representative:Article;members:WorkingMember[]};
type Similarity={score:number;titleJ:number;titleC:number;bodyJ:number;bodyC:number;hours:number;eventScore:number;eventMatch:boolean;eventSignals:string[]};
const ENGINE='online-story-rule-v1.3';
const WINDOW_MS=48*60*60*1000;
const STOPWORDS=new Set(['dan','yang','di','ke','dari','untuk','pada','dengan','atau','ini','itu','dalam','atas','sebagai','oleh','kota','berita','batam']);
const SOURCE_SUFFIX=/\s*[-|–—]\s*(tribun\s*batam|tribunbatam(?:\.id)?|antara(?:news)?|batamnews|detik|kompas|tempo|liputan6|cnn\s*indonesia|tvone)(?:\.com|\.id)?\s*$/i;
const EVENT_GROUPS:[string,RegExp][]=[
 ['conflict',/\b(bentrok(?:an)?|ricuh|keributan|konflik|tawuran)\b/i],
 ['fire',/\b(kebakaran|terbakar|dilalap\s+api|si\s+jago\s+merah)\b/i],
 ['flood',/\b(banjir|genangan|terendam)\b/i],
 ['accident',/\b(kecelakaan|tabrakan|lakalantas|laka\s+lantas)\b/i],
 ['crime',/\b(pencurian|curanmor|perampokan|pembunuhan|penikaman)\b/i]
];
const LOCATION_TERMS=['barelang','jembatan iii','jembatan 3','batam center','batam centre','nagoya','sekupang','batu aji','sagulung','nongsa','bengkong','lubuk baja','sei beduk','batu ampar','belakang padang','bulang','galang'];
function cleanDisplayTitle(v:string|null|undefined){return String(v??'').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(SOURCE_SUFFIX,'').replace(/\s+/g,' ').trim();}
function normalize(v:string|null|undefined){return cleanDisplayTitle(v).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function tokens(v:string|null|undefined,max=100){return normalize(v).split(' ').filter(x=>x.length>2&&!STOPWORDS.has(x)).slice(0,max);}
function jaccard(a:string[],b:string[]){const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n);}
function containment(a:string[],b:string[]){const A=new Set(a),B=new Set(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.min(A.size,B.size);}
function when(a:Article){const n=new Date(a.published_at||a.created_at||'').getTime();return Number.isFinite(n)?n:0;}
function fullText(a:Article){return normalize([a.title,a.summary,a.content].filter(Boolean).join(' '));}
function eventKinds(a:Article){const text=fullText(a);return EVENT_GROUPS.filter(([,re])=>re.test(text)).map(([name])=>name);}
function locations(a:Article){const text=fullText(a);return LOCATION_TERMS.filter(x=>text.includes(x));}
function numbers(a:Article){const text=normalize(a.title);return [...new Set((text.match(/\b\d{1,4}\b/g)||[]).filter(x=>Number(x)>0))];}
function intersection(a:string[],b:string[]){const B=new Set(b);return a.filter(x=>B.has(x));}
function eventEvidence(a:Article,b:Article,hours:number){
 const kinds=intersection(eventKinds(a),eventKinds(b));
 const locs=intersection(locations(a),locations(b));
 const nums=intersection(numbers(a),numbers(b));
 const signals:string[]=[];
 if(kinds.length)signals.push('event:'+kinds.join(','));
 if(locs.length)signals.push('location:'+locs.join(','));
 if(nums.length)signals.push('fact:'+nums.join(','));
 if(hours<=6)signals.push('time:6h');else if(hours<=24)signals.push('time:24h');
 let score=0;
 if(kinds.length)score+=.38;
 if(locs.length)score+=.30;
 if(nums.length)score+=.16;
 if(hours<=6)score+=.16;else if(hours<=24)score+=.10;else if(hours<=48)score+=.04;
 // Event-aware matching is intentionally conservative: a shared event family and
 // specific location are mandatory. A shared numeric fact or strong textual/body
 // overlap is then required to prevent unrelated stories in the same area merging.
 const eventMatch=hours<=48&&kinds.length>0&&locs.length>0;
 return{score:Math.min(1,score),eventMatch,signals,sharedNumbers:nums.length};
}
export function storySimilarity(a:Article,b:Article):Similarity{
 const at=tokens(a.title,60),bt=tokens(b.title,60),titleJ=jaccard(at,bt),titleC=containment(at,bt);
 const as=tokens(a.summary||a.content,180),bs=tokens(b.summary||b.content,180),bodyJ=jaccard(as,bs),bodyC=containment(as,bs);
 const hours=Math.abs(when(a)-when(b))/3600000;
 const ev=eventEvidence(a,b,hours);
 const lexical=Math.max(titleJ,titleC*.97,bodyJ*.78,bodyC*.70,.72*titleJ+.28*bodyJ);
 const eventQualified=ev.eventMatch&&(ev.sharedNumbers>0||titleJ>=.25||titleC>=.42||bodyJ>=.20||bodyC>=.32);
 const score=Math.max(lexical,eventQualified?Math.min(.92,.55+.45*ev.score):0);
 return{score:Math.max(0,Math.min(1,score)),titleJ,titleC,bodyJ,bodyC,hours,eventScore:ev.score,eventMatch:eventQualified,eventSignals:ev.signals};
}
function classify(s:Similarity):MemberType|null{
 if(s.hours>48)return null;
 if(s.titleJ>=.86||s.titleC>=.94)return'identical';
 if((s.titleJ>=.58&&s.titleC>=.72)||(s.titleC>=.82&&s.bodyC>=.45)||(s.titleJ>=.48&&s.bodyJ>=.38))return'similar';
 if(s.eventMatch&&s.eventScore>=.72)return'similar';
 return null;
}
function best(m:Article,c:WorkingCluster){let bestScore=storySimilarity(m,c.representative);for(const x of c.members){const s=storySimilarity(m,x.article);if(s.score>bestScore.score)bestScore=s;}return bestScore;}
function chooseRepresentative(ms:WorkingMember[]){return ms.slice().sort((a,b)=>when(a.article)-when(b.article)||Number(a.article.id)-Number(b.article.id))[0].article;}
async function persist(client:PoolClient,clusters:WorkingCluster[]){
 await client.query('DELETE FROM online_story_cluster_members');await client.query('DELETE FROM online_story_clusters');
 for(const c of clusters){
  c.representative=chooseRepresentative(c.members);
  const times=c.members.map(x=>when(x.article)).filter(Boolean).sort((a,b)=>a-b),sources=new Set(c.members.map(x=>x.article.source_id).filter(Boolean));
  const ins=await client.query(`INSERT INTO online_story_clusters(canonical_title,representative_article_id,member_count,source_count,first_published_at,last_published_at,engine_version,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,[cleanDisplayTitle(c.representative.title),c.representative.id,c.members.length,sources.size,times[0]?new Date(times[0]).toISOString():null,times.length?new Date(times[times.length-1]).toISOString():null,ENGINE]);
  for(const m of c.members){const sim=storySimilarity(m.article,c.representative);const s=m.article.id===c.representative.id?1:sim.score;const type=m.article.id===c.representative.id?'representative':(classify(sim)||m.type);const matched=m.article.id===c.representative.id?ENGINE:(sim.eventMatch?ENGINE+':event-aware':ENGINE+':lexical');await client.query(`INSERT INTO online_story_cluster_members(cluster_id,article_id,similarity_score,similarity_type,matched_by) VALUES($1,$2,$3,$4,$5)`,[ins.rows[0].id,m.article.id,s,type,matched]);}
 }
}
export async function rebuildOnlineStoryClusters(pool:Pool,days=7,limit=1000){
 const {rows}=await pool.query<Article>(`SELECT a.id,a.source_id,ms.name source_name,a.title,a.summary,a.content,a.published_at,a.created_at FROM articles a JOIN media_sources ms ON ms.id=a.source_id WHERE LOWER(COALESCE(ms.category,''))='online' AND COALESCE(a.published_at,a.created_at)>=NOW()-($1::int*INTERVAL '1 day') ORDER BY COALESCE(a.published_at,a.created_at) ASC,a.id ASC LIMIT $2`,[days,limit]);
 const clusters:WorkingCluster[]=[];
 for(const a of rows){let target:WorkingCluster|null=null,signal:Similarity|null=null;for(let i=clusters.length-1;i>=0;i--){const c=clusters[i];if(when(a)-when(c.representative)>WINDOW_MS)break;const s=best(a,c);if(classify(s)&&(!signal||s.score>signal.score)){target=c;signal=s;}}if(target&&signal)target.members.push({article:a,score:signal.score,type:classify(signal)!});else clusters.push({representative:a,members:[{article:a,score:1,type:'representative'}]});}
 const client=await pool.connect();try{await client.query('BEGIN');await persist(client,clusters);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 return{articles:rows.length,clusters:clusters.length,multiSource:clusters.filter(c=>new Set(c.members.map(x=>x.article.source_id)).size>1).length,maxSources:clusters.reduce((n,c)=>Math.max(n,new Set(c.members.map(x=>x.article.source_id)).size),0),engine:ENGINE};
}
