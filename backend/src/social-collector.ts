import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { calculateRisk } from './risk.js';
import { analyzeSocialRoutingV16 } from './social-v16-adapter.js';
import { loadOrganizationMediaScope } from './organization-media-scope.js';
import { classifySocialOrganizationScope } from './social-organization-scope.js';
import type { SocialConversationContext } from './social-context-adapter.js';

export type SocialPlatform = 'instagram'|'facebook'|'tiktok'|'x'|'youtube'|'website'|'threads'|'other';
export type SocialContentType = 'post'|'comment'|'reply'|'video'|'short'|'reel'|'story'|'live'|'article'|'other';

export type SocialCandidate = {
  platform: SocialPlatform; externalId?: string|null; contentType?: SocialContentType; sourceKind?: 'owned'|'external'|'manual'; ownedAccountId?: number|null; opdId?: number|null; authorName?: string|null; authorHandle?: string|null; authorProfileUrl?: string|null; canonicalUrl?: string|null; title?: string|null; content?: string|null; language?: string|null; publishedAt?: string|Date|null; collector?: string|null; rawPayload?: unknown; metadata?: unknown; context?: SocialConversationContext|null;
};
const normalized=(value:string)=>value.toLowerCase().replace(/\s+/g,' ').trim();

export function socialContentHash(candidate:SocialCandidate){
 const raw=[candidate.platform,candidate.authorHandle||'',candidate.canonicalUrl||'',candidate.title||'',candidate.content||'',candidate.publishedAt?new Date(candidate.publishedAt).toISOString():''].join('|').toLowerCase();
 return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function ingestSocialCandidate(pool:Pool,candidate:SocialCandidate,defaultCollector='social-batch'){
 const scope=await loadOrganizationMediaScope(pool);
 if(!scope)throw new Error('ACTIVE_ORGANIZATION_UNRESOLVED');
 const scopeDecision=classifySocialOrganizationScope({title:candidate.title,content:candidate.content,context:candidate.context},scope);
 if(candidate.sourceKind!=='owned'&&scopeDecision.status==='OUT_OF_SCOPE')return{skipped:true,reason:'ORGANIZATION_SCOPE_OUT_OF_SCOPE',scopeDecision,platform:candidate.platform,externalId:candidate.externalId??null};
 if(candidate.sourceKind!=='owned'&&scopeDecision.status==='REVIEW'){
  const contentHash=socialContentHash(candidate),publishedAt=candidate.publishedAt?new Date(candidate.publishedAt):null;
  const metadata={...(candidate.metadata&&typeof candidate.metadata==='object'&&!Array.isArray(candidate.metadata)?candidate.metadata as Record<string,unknown>:{}),socialContext:candidate.context??null,organizationScope:scopeDecision};
  const values=[candidate.platform,candidate.externalId??null,candidate.contentType??'post',candidate.sourceKind??'external',candidate.ownedAccountId??null,null,candidate.authorName??null,candidate.authorHandle??null,candidate.authorProfileUrl??null,candidate.canonicalUrl??null,candidate.title??null,candidate.content??null,candidate.language??null,publishedAt,null,null,null,null,null,null,contentHash,candidate.collector??defaultCollector,JSON.stringify(candidate.rawPayload??{}),JSON.stringify(metadata),'captured',null];
  const columns=`platform,external_id,content_type,source_kind,owned_account_id,opd_id,author_name,author_handle,author_profile_url,canonical_url,title,content,language,published_at,sentiment,sentiment_score,importance_score,influence_score,risk_score,risk_level,content_hash,collector,raw_payload,metadata,processing_status,curation_status`,placeholders=values.map((_,i)=>`${i+1}`).join(',');
  const update=`content_type=EXCLUDED.content_type,source_kind=EXCLUDED.source_kind,owned_account_id=EXCLUDED.owned_account_id,author_name=EXCLUDED.author_name,author_handle=EXCLUDED.author_handle,author_profile_url=EXCLUDED.author_profile_url,canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,content=EXCLUDED.content,language=EXCLUDED.language,published_at=EXCLUDED.published_at,collector=EXCLUDED.collector,raw_payload=EXCLUDED.raw_payload,metadata=EXCLUDED.metadata,processing_status='captured',opd_id=NULL,sentiment=NULL,sentiment_score=NULL,importance_score=NULL,influence_score=NULL,risk_score=NULL,risk_level=NULL,updated_at=now()`;
  const contentConflict=candidate.ownedAccountId!=null?`ON CONFLICT(platform,owned_account_id,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NOT NULL`:`ON CONFLICT(platform,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NULL`;
  const sql=candidate.externalId?`INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ON CONFLICT(platform,external_id) WHERE external_id IS NOT NULL DO UPDATE SET ${update} RETURNING id,platform,external_id,processing_status`:`INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ${contentConflict} DO UPDATE SET ${update} RETURNING id,platform,external_id,processing_status`;
  const existing=candidate.externalId?(await pool.query(`SELECT id,metadata FROM social_mentions WHERE platform=$1 AND external_id=$2 LIMIT 1`,[candidate.platform,candidate.externalId])).rows[0]:null;
  if(existing?.metadata?.manualClassification?.locked===true||existing?.metadata?.socialVerification?.status==='LOCKED')return{...existing,skipped:true,reason:'CLASSIFICATION_LOCKED',scopeDecision};
  const mention=(await pool.query(sql,values)).rows[0];
  await pool.query(`DELETE FROM social_mention_keywords WHERE mention_id=$1`,[mention.id]);
  await pool.query(`DELETE FROM social_mention_issues WHERE mention_id=$1 AND COALESCE(linkage_source,'rule')<>'manual'`,[mention.id]);
  return{...mention,skipped:true,reason:'ORGANIZATION_SCOPE_REVIEW_REQUIRED',scopeDecision};
 }
 const routingContent=[candidate.context?.parentContent?.title,candidate.context?.parentContent?.content,candidate.context?.parentComment?.content,candidate.content].filter(Boolean).join(' ');
 const routing=await analyzeSocialRoutingV16(pool,{title:candidate.title,content:routingContent});
 const matchedKeywords=routing.keyword?[routing.keyword]:[];
 const query=parseKeywordQuery(matchedKeywords.join(' | '));
 const analysis=analyzeCoreArticle({
  id:candidate.externalId??socialContentHash(candidate),
  title:String(candidate.title||candidate.content||'').slice(0,300),
  summary:String(candidate.content||'').slice(0,900),
  content:candidate.content??null,
  sourceName:candidate.authorName??candidate.authorHandle??candidate.platform,
  sourceTier:null,
  mediaKind:'social',
  opdId:routing.primaryOpdId,
  publishedAt:candidate.publishedAt??null
 },query,1);
 const finalRisk=calculateRisk({importance:analysis.importanceScore,impact:analysis.impactScore,velocity:analysis.velocityScore,sentiment:analysis.sentiment,sentimentScore:analysis.sentimentScore});
 const contentHash=socialContentHash(candidate),publishedAt=candidate.publishedAt?new Date(candidate.publishedAt):null;
 const curationStatus=candidate.sourceKind==='owned'&&candidate.platform==='website'?'candidate':null;
 const metadata={...(candidate.metadata&&typeof candidate.metadata==='object'&&!Array.isArray(candidate.metadata)?candidate.metadata as Record<string,unknown>:{}),socialContext:candidate.context??null,v16Routing:routing,intelligence:{...analysis,riskLevel:finalRisk.level,riskReasons:finalRisk.reasons,riskStatus:'PROVISIONAL'}};
 const values=[candidate.platform,candidate.externalId??null,candidate.contentType??'post',candidate.sourceKind??'external',candidate.ownedAccountId??null,routing.primaryOpdId,candidate.authorName??null,candidate.authorHandle??null,candidate.authorProfileUrl??null,candidate.canonicalUrl??null,candidate.title??null,candidate.content??null,candidate.language??null,publishedAt,analysis.sentiment,analysis.sentimentScore,analysis.importanceScore,analysis.impactScore,finalRisk.score,finalRisk.level,contentHash,candidate.collector??defaultCollector,JSON.stringify(candidate.rawPayload??{}),JSON.stringify(metadata),routing.routingStatus==='ROUTED'?'classified':'captured',curationStatus];
 const columns=`platform,external_id,content_type,source_kind,owned_account_id,opd_id,author_name,author_handle,author_profile_url,canonical_url,title,content,language,published_at,sentiment,sentiment_score,importance_score,influence_score,risk_score,risk_level,content_hash,collector,raw_payload,metadata,processing_status,curation_status`,placeholders=values.map((_,i)=>`$${i+1}`).join(',');
 const update=`content_type=EXCLUDED.content_type,source_kind=EXCLUDED.source_kind,owned_account_id=EXCLUDED.owned_account_id,opd_id=EXCLUDED.opd_id,author_name=EXCLUDED.author_name,author_handle=EXCLUDED.author_handle,author_profile_url=EXCLUDED.author_profile_url,canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,content=EXCLUDED.content,language=EXCLUDED.language,published_at=EXCLUDED.published_at,sentiment=EXCLUDED.sentiment,sentiment_score=EXCLUDED.sentiment_score,importance_score=EXCLUDED.importance_score,influence_score=EXCLUDED.influence_score,risk_score=EXCLUDED.risk_score,risk_level=EXCLUDED.risk_level,collector=EXCLUDED.collector,raw_payload=EXCLUDED.raw_payload,metadata=EXCLUDED.metadata,processing_status=EXCLUDED.processing_status,updated_at=now()`;
 const contentConflict=candidate.ownedAccountId!=null?`ON CONFLICT(platform,owned_account_id,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NOT NULL`:`ON CONFLICT(platform,content_hash) WHERE content_hash IS NOT NULL AND owned_account_id IS NULL`;
 const sql=candidate.externalId?`INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ON CONFLICT(platform,external_id) WHERE external_id IS NOT NULL DO UPDATE SET ${update} RETURNING id,platform,external_id,opd_id,sentiment,risk_score,risk_level,processing_status,curation_status`:`INSERT INTO social_mentions(${columns}) VALUES(${placeholders}) ${contentConflict} DO UPDATE SET ${update} RETURNING id,platform,external_id,opd_id,sentiment,risk_score,risk_level,processing_status,curation_status`;
 const existing=candidate.externalId?(await pool.query(`SELECT id,metadata FROM social_mentions WHERE platform=$1 AND external_id=$2 LIMIT 1`,[candidate.platform,candidate.externalId])).rows[0]:null;
 if(existing?.metadata?.manualClassification?.locked===true||existing?.metadata?.socialVerification?.status==='LOCKED')return{...existing,skipped:true,reason:'CLASSIFICATION_LOCKED',scopeDecision,routing:existing.metadata?.v16Routing??null};
 const{rows}=await pool.query(sql,values),mention=rows[0];
 if(routing.keywordId)await pool.query(`INSERT INTO social_mention_keywords(mention_id,keyword_id,matched_text,match_count,confidence) VALUES($1,$2,$3,1,$4) ON CONFLICT(mention_id,keyword_id) DO UPDATE SET matched_text=EXCLUDED.matched_text,match_count=EXCLUDED.match_count,confidence=EXCLUDED.confidence`,[mention.id,routing.keywordId,routing.keyword??'',routing.score>0?Math.min(1,routing.score/100):0]);
 // Do not create Issue evidence at collection time. Social/Owned evidence must pass
 // the explicit verification/lock gate before Issue Monitor can link it.
 await pool.query(`INSERT INTO evidence_sources(source_type,source_url,source_label,captured_at,content_hash,metadata,social_mention_id) SELECT $1,$2,$3,now(),$4,$5::jsonb,$6 WHERE NOT EXISTS(SELECT 1 FROM evidence_sources WHERE social_mention_id=$6)`,[candidate.sourceKind==='owned'?'owned_social':'social',candidate.canonicalUrl??null,candidate.authorName??candidate.authorHandle??candidate.platform,contentHash,JSON.stringify({collector:candidate.collector??defaultCollector,externalId:candidate.externalId??null,classificationEngine:routing.engine}),mention.id]);
 return{...mention,keywordMatches:routing.keywordId?1:0,matchedKeywordIds:routing.keywordId?[Number(routing.keywordId)]:[],scopeDecision,routing};
}

export async function ingestSocialBatch(pool:Pool,candidates:SocialCandidate[],collector='social-batch'){const results:Record<string,unknown>[]=[];for(const candidate of candidates){try{results.push({ok:true,...await ingestSocialCandidate(pool,candidate,collector)})}catch(error){results.push({ok:false,platform:candidate.platform,externalId:candidate.externalId??null,error:error instanceof Error?error.message:String(error)})}}return{received:candidates.length,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results}}
