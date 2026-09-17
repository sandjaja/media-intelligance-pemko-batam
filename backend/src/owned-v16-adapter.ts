import type { Pool } from 'pg';
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

/**
 * Decision-only adapter for official Owned Channel publications.
 * Publisher ownership is deliberately NOT supplied as routing evidence: the OPD
 * responsible for the content must be decided by Master Classification V16.5.
 * The online external-media actor gate is deliberately not used here.
 */
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
      engine: OWNED_CLASSIFICATION_VERSION,
      generatedAt: new Date().toISOString(),
      routingStatus,
      primaryOpdId: null,
      primaryOpdName: null,
      primaryOpdCode: null,
      supportingOpdIds: [],
      supportingOpds: [],
      keywordId: null,
      keyword: null,
      keywordSource,
      taxonomyId: headlineTaxonomies[0]?.id || null,
      taxonomyName: headlineTaxonomies[0]?.name || null,
      matchType: null,
      score: 0,
      headlineTaxonomies,
      needsVerification: true,
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
    engine: OWNED_CLASSIFICATION_VERSION,
    generatedAt: new Date().toISOString(),
    routingStatus: 'ROUTED',
    primaryOpdId: evidence.opdId,
    primaryOpdName: primaryOpd?.name || null,
    primaryOpdCode: primaryOpd?.code || null,
    supportingOpdIds: evidence.supportingOpdIds,
    supportingOpds,
    keywordId: evidence.keywordId,
    keyword: evidence.keyword,
    keywordSource,
    taxonomyId: evidence.taxonomyId,
    taxonomyName: evidence.taxonomyName,
    matchType: evidence.matchType,
    score: evidence.score,
    headlineTaxonomies,
    needsVerification: false,
    note: 'Routing Owned Channel menggunakan Master Classification dan Context Dominance V16.5. Identitas akun penerbit dipertahankan sebagai ownership context dan tidak dipakai sebagai Primary OPD evidence.',
  };
}
