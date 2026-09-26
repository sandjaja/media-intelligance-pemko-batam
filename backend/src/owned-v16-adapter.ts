import type { Pool, PoolClient } from 'pg';
import { analyzeArticle as analyzeCoreArticle, parseKeywordQuery } from './media-intelligence-core.js';
import { calculateRisk } from './risk.js';
import { getV16HeadlineTaxonomies, getV16PrimaryEvidenceForInput, type V16HeadlineTaxonomy, type V16PrimaryEvidence } from './context-dominance-v16.js';

export const OWNED_CLASSIFICATION_VERSION = 'article-opd-v16.5-20260916';

export type OwnedV16Input = {
  title?: string | null;
  content?: string | null;
  manualKeywordId?: string | number | null;
};

type NamedOpd = { id: string; code: string | null; name: string };

export type OwnedV16RoutingResult = {
  engine: typeof OWNED_CLASSIFICATION_VERSION;
  generatedAt: string;
  routingStatus: 'ROUTED' | 'AMBIGUOUS' | 'UNROUTED';
  primaryOpdId: string | null;
  primaryOpdName: string | null;
  primaryOpdCode: string | null;
  supportingOpdIds: string[];
  supportingOpds: NamedOpd[];
  keywordId: string | null;
  keyword: string | null;
  keywordSource: 'AUTO' | 'MANUAL';
  taxonomyId: string | null;
  taxonomyName: string | null;
  matchType: V16PrimaryEvidence['matchType'] | null;
  score: number;
  headlineTaxonomies: V16HeadlineTaxonomy[];
  needsVerification: boolean;
  note: string;
};

export type OwnedV16LockedRouting = OwnedV16RoutingResult & {
  verificationStatus: 'LOCKED';
  verifiedBy: string;
  verifiedAt: string;
};

/** Decision-only adapter for official Owned Channel publications. */
export async function analyzeOwnedRoutingV16(pool: Pool, input: OwnedV16Input): Promise<OwnedV16RoutingResult> {
  const title = String(input.title || '').trim();
  const content = String(input.content || '').replace(/\s+/g, ' ').trim();
  const lead = content.slice(0, 900);
  const manualKeywordIds = input.manualKeywordId == null ? [] : [input.manualKeywordId];
  const keywordSource: OwnedV16RoutingResult['keywordSource'] = manualKeywordIds.length ? 'MANUAL' : 'AUTO';
  const headlineTaxonomies = await getV16HeadlineTaxonomies(pool, title);
  const evidence = await getV16PrimaryEvidenceForInput(pool, { title, summary: lead, content: '', manualKeywordIds });

  if (!evidence) {
    const routingStatus: OwnedV16RoutingResult['routingStatus'] = headlineTaxonomies.length ? 'AMBIGUOUS' : 'UNROUTED';
    return {
      engine: OWNED_CLASSIFICATION_VERSION, generatedAt: new Date().toISOString(), routingStatus,
      primaryOpdId: null, primaryOpdName: null, primaryOpdCode: null,
      supportingOpdIds: [], supportingOpds: [], keywordId: null, keyword: null, keywordSource,
      taxonomyId: headlineTaxonomies[0]?.id || null, taxonomyName: headlineTaxonomies[0]?.name || null,
      matchType: null, score: 0, headlineTaxonomies, needsVerification: true,
      note: manualKeywordIds.length
        ? 'Master Keyword pilihan tidak memiliki mapping aktif yang cukup untuk routing V16.5.'
        : headlineTaxonomies.length
          ? 'Headline taxonomy terdeteksi, tetapi belum ada Master Classification evidence yang cukup untuk Primary OPD.'
          : 'Tidak ada Master Classification evidence yang cukup untuk menentukan Primary OPD.',
    };
  }

  const routedIds = [...new Set([evidence.opdId, ...evidence.supportingOpdIds])];
  const opdRows = (await pool.query(`SELECT id,code,name FROM opd WHERE id=ANY($1::bigint[])`, [routedIds])).rows;
  const opdMap = new Map(opdRows.map((r: any) => [String(r.id), { id: String(r.id), code: r.code ? String(r.code) : null, name: String(r.name || '') }]));
  const primaryOpd = opdMap.get(String(evidence.opdId)) || null;
  const supportingOpds = evidence.supportingOpdIds.map(id => opdMap.get(String(id))).filter(Boolean) as NamedOpd[];

  return {
    engine: OWNED_CLASSIFICATION_VERSION, generatedAt: new Date().toISOString(), routingStatus: 'ROUTED',
    primaryOpdId: evidence.opdId, primaryOpdName: primaryOpd?.name || null, primaryOpdCode: primaryOpd?.code || null,
    supportingOpdIds: evidence.supportingOpdIds, supportingOpds,
    keywordId: evidence.keywordId, keyword: evidence.keyword, keywordSource,
    taxonomyId: evidence.taxonomyId, taxonomyName: evidence.taxonomyName,
    matchType: evidence.matchType, score: evidence.score, headlineTaxonomies, needsVerification: false,
    note: 'Routing Owned Channel menggunakan Master Classification dan Context Dominance V16.5. Identitas akun penerbit dipertahankan sebagai ownership context dan tidak dipakai sebagai Primary OPD evidence.',
  };
}

/**
 * Persists only the verified V16.5 result. Legacy social_mention_keywords are
 * deliberately left untouched because they may contain broad collector matches.
 */
export async function lockOwnedRoutingV16(client: PoolClient, mentionId: number, routing: OwnedV16RoutingResult, verifiedBy: string): Promise<OwnedV16LockedRouting> {
  if (routing.routingStatus !== 'ROUTED' || !routing.primaryOpdId || !routing.keywordId) {
    throw new Error('OWNED_V16_ROUTING_NOT_READY_TO_LOCK');
  }
  const verifiedAt = new Date().toISOString();
  const locked: OwnedV16LockedRouting = { ...routing, verificationStatus: 'LOCKED', verifiedBy, verifiedAt };
  const publication=(await client.query(`SELECT title,content,published_at,author_name,platform FROM social_mentions WHERE id=$1 AND source_kind='owned' AND curation_status='approved' LIMIT 1`,[mentionId])).rows[0];
  if (!publication) throw new Error('APPROVED_OWNED_PUBLICATION_NOT_FOUND');
  const intelligence=analyzeCoreArticle({id:mentionId,title:publication.title,summary:String(publication.content||'').slice(0,900),content:publication.content,sourceName:publication.author_name||publication.platform,mediaKind:'social',opdId:routing.primaryOpdId,publishedAt:publication.published_at},parseKeywordQuery(String(routing.keyword||'')),1);
  const risk=calculateRisk({importance:intelligence.importanceScore,impact:intelligence.impactScore,velocity:intelligence.velocityScore,sentiment:intelligence.sentiment,sentimentScore:intelligence.sentimentScore});
  const result = await client.query(
    `UPDATE social_mentions
       SET opd_id=$2,sentiment=$4,sentiment_score=$5,importance_score=$6,influence_score=$7,risk_score=$8,risk_level=$9,
           metadata=jsonb_set(jsonb_set(COALESCE(metadata,'{}'::jsonb),'{v16Routing}',$3::jsonb,true),'{intelligence}',$10::jsonb,true),
           updated_at=now()
     WHERE id=$1 AND source_kind='owned' AND curation_status='approved'
     RETURNING id`,
    [mentionId, routing.primaryOpdId, JSON.stringify(locked), intelligence.sentiment, intelligence.sentimentScore, intelligence.importanceScore, intelligence.impactScore, risk.score, risk.level, JSON.stringify({...intelligence,riskLevel:risk.level,riskReasons:risk.reasons,riskStatus:'FINAL',riskFinalizedAt:new Date().toISOString()})],
  );
  if (!result.rows[0]) throw new Error('APPROVED_OWNED_PUBLICATION_NOT_FOUND');
  return locked;
}

/** Reopens only V16.5 verification state; it does not touch curation or legacy keyword rows. */
export async function reopenOwnedRoutingV16(client: PoolClient, mentionId: number): Promise<void> {
  const result = await client.query(
    `UPDATE social_mentions
       SET opd_id=NULL,
           metadata=COALESCE(metadata,'{}'::jsonb)-'v16Routing',
           updated_at=now()
     WHERE id=$1 AND source_kind='owned' AND curation_status='approved'
       AND COALESCE(metadata->'v16Routing'->>'verificationStatus','')='LOCKED'
     RETURNING id`,
    [mentionId],
  );
  if (!result.rows[0]) throw new Error('LOCKED_OWNED_V16_ROUTING_NOT_FOUND');
}
