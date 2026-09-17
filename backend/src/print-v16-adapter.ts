import type { Pool } from 'pg';
import { getV16HeadlineTaxonomies, getV16PrimaryEvidenceForInput, type V16HeadlineTaxonomy, type V16PrimaryEvidence } from './context-dominance-v16.js';

export const PRINT_CLASSIFICATION_VERSION = 'article-opd-v16.5-20260916';

export type PrintV16Input = {
  title?: string | null;
  summary?: string | null;
  bodyText?: string | null;
};

export type PrintV16RoutingResult = {
  engine: typeof PRINT_CLASSIFICATION_VERSION;
  generatedAt: string;
  routingStatus: 'ROUTED' | 'AMBIGUOUS';
  primaryOpdId: string | null;
  supportingOpdIds: string[];
  keywordId: string | null;
  keyword: string | null;
  taxonomyId: string | null;
  taxonomyName: string | null;
  matchType: V16PrimaryEvidence['matchType'] | null;
  score: number;
  headlineTaxonomies: V16HeadlineTaxonomy[];
  needsVerification: boolean;
  note: string;
};

/**
 * Print adapter for the stable V16.5 Context Dominance engine.
 *
 * Important boundaries:
 * - Input is the VERIFIED clipping text, not a row from online `articles`.
 * - No operator OPD/keyword is supplied as routing evidence.
 * - No Issue/Risk/Sentiment calculation is performed in this phase.
 * - This function is decision-only: it does not mutate print or online tables.
 */
export async function analyzePrintRoutingV16(pool: Pool, input: PrintV16Input): Promise<PrintV16RoutingResult> {
  const title = String(input.title || '');
  const summary = String(input.summary || '');
  const bodyText = String(input.bodyText || '');

  const headlineTaxonomies = await getV16HeadlineTaxonomies(pool, title);
  const evidence = await getV16PrimaryEvidenceForInput(pool, {
    title,
    summary,
    content: bodyText,
    manualKeywordIds: [],
  });

  if (!evidence) {
    return {
      engine: PRINT_CLASSIFICATION_VERSION,
      generatedAt: new Date().toISOString(),
      routingStatus: 'AMBIGUOUS',
      primaryOpdId: null,
      supportingOpdIds: [],
      keywordId: null,
      keyword: null,
      taxonomyId: headlineTaxonomies[0]?.id || null,
      taxonomyName: headlineTaxonomies[0]?.name || null,
      matchType: null,
      score: 0,
      headlineTaxonomies,
      needsVerification: true,
      note: headlineTaxonomies.length
        ? 'Headline taxonomy terdeteksi, tetapi tidak ada DIRECT Master Classification evidence yang cukup untuk Primary OPD.'
        : 'Tidak ada DIRECT Master Classification evidence yang cukup untuk menentukan Primary OPD.',
    };
  }

  return {
    engine: PRINT_CLASSIFICATION_VERSION,
    generatedAt: new Date().toISOString(),
    routingStatus: 'ROUTED',
    primaryOpdId: evidence.opdId,
    supportingOpdIds: evidence.supportingOpdIds,
    keywordId: evidence.keywordId,
    keyword: evidence.keyword,
    taxonomyId: evidence.taxonomyId,
    taxonomyName: evidence.taxonomyName,
    matchType: evidence.matchType,
    score: evidence.score,
    headlineTaxonomies,
    needsVerification: false,
    note: 'Routing Media Cetak menggunakan Master Classification dan Context Dominance V16.5 yang sama dengan Media Online.',
  };
}
