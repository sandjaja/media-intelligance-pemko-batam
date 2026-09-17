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
  routingStatus: 'ROUTED' | 'AMBIGUOUS' | 'UNROUTED';
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
  evidenceSource: 'TITLE_SUMMARY' | 'TITLE_OCR_LEAD';
  note: string;
};

function controlledOcrLead(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const cut = text.search(/\b(?:baca juga|pewarta\s*:|editor\s*:|copyright\b|iklan\b|advertorial\b)\b/i);
  return (cut >= 0 ? text.slice(0, cut) : text).slice(0, 900);
}

/**
 * Print adapter for the stable V16.5 Context Dominance engine.
 *
 * Important boundaries:
 * - Input is VERIFIED clipping metadata/text, not a row from online `articles`.
 * - Title + verified summary are the primary routing evidence.
 * - Full OCR body is NEVER supplied to the OPD router.
 * - OCR is only a controlled lead fallback (max 900 chars) when summary is empty.
 * - No operator OPD/keyword is supplied as routing evidence.
 * - No Issue/Risk/Sentiment calculation is performed in this phase.
 * - This function is decision-only: it does not mutate print or online tables.
 */
export async function analyzePrintRoutingV16(pool: Pool, input: PrintV16Input): Promise<PrintV16RoutingResult> {
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const ocrLead = summary ? '' : controlledOcrLead(String(input.bodyText || ''));
  const routingLead = summary || ocrLead;
  const evidenceSource: PrintV16RoutingResult['evidenceSource'] = summary ? 'TITLE_SUMMARY' : 'TITLE_OCR_LEAD';

  const headlineTaxonomies = await getV16HeadlineTaxonomies(pool, title);
  const evidence = await getV16PrimaryEvidenceForInput(pool, {
    title,
    summary: routingLead,
    content: '',
    manualKeywordIds: [],
  });

  if (!evidence) {
    const routingStatus: PrintV16RoutingResult['routingStatus'] = headlineTaxonomies.length ? 'AMBIGUOUS' : 'UNROUTED';
    return {
      engine: PRINT_CLASSIFICATION_VERSION,
      generatedAt: new Date().toISOString(),
      routingStatus,
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
      evidenceSource,
      note: headlineTaxonomies.length
        ? 'Headline taxonomy terdeteksi, tetapi belum ada Master Classification evidence yang cukup untuk Primary OPD.'
        : 'Tidak ada Master Classification evidence atau headline taxonomy yang cukup untuk menentukan Primary OPD.',
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
    evidenceSource,
    note: 'Routing Media Cetak menggunakan Master Classification dan Context Dominance V16.5. Full OCR body tidak digunakan sebagai evidence routing.',
  };
}
