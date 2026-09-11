import crypto from 'node:crypto';
import type { Pool } from 'pg';

export type SocialPlatform = 'instagram'|'facebook'|'tiktok'|'x'|'youtube'|'website'|'threads'|'other';
export type SocialContentType = 'post'|'comment'|'reply'|'video'|'short'|'reel'|'story'|'live'|'article'|'other';

export type SocialCandidate = {
  platform: SocialPlatform;
  externalId?: string | null;
  contentType?: SocialContentType;
  sourceKind?: 'owned'|'external'|'manual';
  ownedAccountId?: number | null;
  opdId?: number | null;
  authorName?: string | null;
  authorHandle?: string | null;
  authorProfileUrl?: string | null;
  canonicalUrl?: string | null;
  title?: string | null;
  content?: string | null;
  language?: string | null;
  publishedAt?: string | Date | null;
  collector?: string | null;
  rawPayload?: unknown;
  metadata?: unknown;
};

type KeywordRow = { id:string; opd_id:string|null; keyword:string; match_type:'contains'|'exact'|'regex'; priority:number };
type KeywordMatch = KeywordRow & { matchedText:string; matchCount:number; confidence:number };

const negativeWords = ['gagal','korupsi','suap','banjir','macet','protes','keluhan','kritik','masalah','rusak','lambat','terlambat','kebakaran','ancaman','sengketa','kecewa','buruk','marah','demo','pungli'];
const positiveWords = ['berhasil','sukses','prestasi','penghargaan','meningkat','investasi','terobosan','apresiasi','aman','lancar','kolaborasi','pertumbuhan','baik','cepat','puas','terima kasih'];

const normalized = (value:string) => value.toLowerCase().replace(/\s+/g,' ').trim();
const escapeRegex = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function socialContentHash(candidate:SocialCandidate) {
  const raw = [candidate.platform,candidate.authorHandle||'',candidate.canonicalUrl||'',candidate.title||'',candidate.content||'',candidate.publishedAt ? new Date(candidate.publishedAt).toISOString() : ''].join('|').toLowerCase();
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function classifySocialText(title?:string|null, content?:string|null) {
  const text = normalized(`${title||''} ${content||''}`);
  const negativeCount = negativeWords.reduce((sum,w)=>sum+(text.includes(w)?1:0),0);
  const positiveCount = positiveWords.reduce((sum,w)=>sum+(text.includes(w)?1:0),0);
  const sentiment:'positive'|'neutral'|'negative' = negativeCount>positiveCount?'negative':positiveCount>negativeCount?'positive':'neutral';
  const sentimentScore = Math.max(-1,Math.min(1,(positiveCount-negativeCount)/Math.max(1,positiveCount+negativeCount)));
  const riskScore = Math.min(100,Math.max(0,15 + negativeCount*13 + (text.length>1000?10:0)));
  const riskLevel:'low'|'medium'|'high'|'critical' = riskScore>=80?'critical':riskScore>=60?'high':riskScore>=35?'medium':'low';
  const importanceScore = Math.min(100,Math.max(10,20 + Math.min(35,Math.floor(text.length/120)) + negativeCount*8 + positiveCount*3));
  return { sentiment, sentimentScore, riskScore, riskLevel, importanceScore };
}

function matchKeyword(text:string,row:KeywordRow):KeywordMatch|null {
  const haystack = normalized(text);
  const needle = normalized(row.keyword);
  if(!needle) return null;
  try {
    if(row.match_type==='regex') {
      const re = new RegExp(row.keyword,'gi');
      const hits = haystack.match(re) || [];
      return hits.length ? {...row,matchedText:hits[0] ?? row.keyword,matchCount:hits.length,confidence:0.95} : null;
    }
    if(row.match_type==='exact') {
      const re = new RegExp(`(^|\\W)${escapeRegex(needle)}($|\\W)`,'gi');
      const hits = haystack.match(re) || [];
      return hits.length ? {...row,matchedText:needle,matchCount:hits.length,confidence:1} : null;
    }
    let count=0,start=0;
    while((start=haystack.indexOf(needle,start))>=0){count++;start+=Math.max(1,needle.length);}
    return count ? {...row,matchedText:needle,matchCount:count,confidence:0.9} : null;
  } catch {
    return null;
  }
}

async function keywordMatches(pool:Pool,text:string,opdId?:number|null) {
  const params:unknown[]=[];
  let scope='';
  if(opdId){params.push(opdId);scope=` AND (opd_id IS NULL OR opd_id=$1)`;}
  const {rows}=await pool.query(`SELECT id,opd_id,keyword,match_type,priority FROM keywords WHERE active=true${scope} ORDER BY priority DESC,id ASC`,params);
  return (rows as KeywordRow[]).map(r=>matchKeyword(text,r)).filter(Boolean) as KeywordMatch[];
}

export async function ingestSocialCandidate(pool:Pool,candidate:SocialCandidate,defaultCollector='social-batch') {
  const text=`${candidate.title||''} ${candidate.content||''}`.trim();
  const analysis=classifySocialText(candidate.title,candidate.content);
  const matches=await keywordMatches(pool,text,candidate.opdId);
  const inferredOpd=candidate.opdId ?? (matches.find(m=>m.opd_id)?.opd_id ? Number(matches.find(m=>m.opd_id)!.opd_id) : null);
  const contentHash=socialContentHash(candidate);
  const publishedAt=candidate.publishedAt ? new Date(candidate.publishedAt) : null;
  const values=[candidate.platform,candidate.externalId??null,candidate.contentType??'post',candidate.sourceKind??'external',candidate.ownedAccountId??null,inferredOpd,candidate.authorName??null,candidate.authorHandle??null,candidate.authorProfileUrl??null,candidate.canonicalUrl??null,candidate.title??null,candidate.content??null,candidate.language??null,publishedAt,analysis.sentiment,analysis.sentimentScore,analysis.importanceScore,0,analysis.riskScore,analysis.riskLevel,contentHash,candidate.collector??defaultCollector,JSON.stringify(candidate.rawPayload??{}),JSON.stringify(candidate.metadata??{}),matches.length?'classified':'captured'];
  const columns=`platform,external_id,content_type,source_kind,owned_account_id,opd_id,author_name,author_handle,author_profile_url,canonical_url,title,content,language,published_at,sentiment,sentiment_score,importance_score,influence_score,risk_score,risk_level,content_hash,collector,raw_payload,metadata,processing_status`;
  const placeholders=values.map((_,i)=>`$${i+1}`).join(',');
  const update=`content_type=EXCLUDED.content_type,source_kind=EXCLUDED.source_kind,owned_account_id=EXCLUDED.owned_account_id,opd_id=COALESCE(EXCLUDED.opd_id,social_mentions.opd_id),author_name=EXCLUDED.author_name,author_handle=EXCLUDED.author_handle,author_profile_url=EXCLUDED.author_profile_url,canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,content=EXCLUDED.content,language=EXCLUDED.language,published_at=EXCLUDED.published_at,sentiment=EXCLUDED.sentiment,sentiment_score=EXCLUDED.sentiment_score,importance_score=EXCLUDED.importance_score,risk_score=EXCLUDED.risk_score,risk_level=EXCLUDED.risk_level,collector=EXCLUDED.collector,raw_payload=EXCLUDED.raw_payload,metadata=EXCLUDED.metadata,processing_status=EXCLUDED.processing_status,updated_at=now()`;
  const contentConflict = candidate.ownedAccountId != null
    ? `ON CONFLICT(platform,owned_account_id,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NOT NULL`
    : `ON CONFLICT(platform,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NULL`;
  const sql=candidate.externalId
    ? `INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ON CONFLICT(platform,external_id) WHERE external_id IS NOT NULL DO UPDATE SET ${update} RETURNING id,platform,external_id,opd_id,sentiment,risk_score,risk_level,processing_status`
    : `INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ${contentConflict} DO UPDATE SET ${update} RETURNING id,platform,external_id,opd_id,sentiment,risk_score,risk_level,processing_status`;
  const {rows}=await pool.query(sql,values);
  const mention=rows[0];
  for(const match of matches){
    await pool.query(`INSERT INTO social_mention_keywords(mention_id,keyword_id,matched_text,match_count,confidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mention_id,keyword_id) DO UPDATE SET matched_text=EXCLUDED.matched_text,match_count=EXCLUDED.match_count,confidence=EXCLUDED.confidence`,[mention.id,match.id,match.matchedText,match.matchCount,match.confidence]);
  }
  await pool.query(`INSERT INTO evidence_sources(source_type,source_url,source_label,captured_at,content_hash,metadata,social_mention_id) SELECT $1,$2,$3,now(),$4,$5::jsonb,$6 WHERE NOT EXISTS(SELECT 1 FROM evidence_sources WHERE social_mention_id=$6)`,[candidate.sourceKind==='owned'?'owned_social':'social',candidate.canonicalUrl??null,candidate.authorName??candidate.authorHandle??candidate.platform,contentHash,JSON.stringify({collector:candidate.collector??defaultCollector,externalId:candidate.externalId??null}),mention.id]);
  return {...mention,keywordMatches:matches.length,matchedKeywordIds:matches.map(m=>Number(m.id))};
}

export async function ingestSocialBatch(pool:Pool,candidates:SocialCandidate[],collector='social-batch') {
  const results:Record<string,unknown>[]=[];
  for(const candidate of candidates){
    try { results.push({ok:true,...await ingestSocialCandidate(pool,candidate,collector)}); }
    catch(error){ results.push({ok:false,platform:candidate.platform,externalId:candidate.externalId??null,error:error instanceof Error?error.message:String(error)}); }
  }
  return {received:candidates.length,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
}
