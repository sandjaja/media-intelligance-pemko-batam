import type { Pool } from 'pg';
import { getV16HeadlineTaxonomies, getV16PrimaryEvidenceForInput, type V16HeadlineTaxonomy, type V16PrimaryEvidence } from './context-dominance-v16.js';

export const PRINT_CLASSIFICATION_VERSION = 'article-opd-v16.5-20260916';

export type PrintV16Input = {
  title?: string | null;
  summary?: string | null;
  bodyText?: string | null;
};

type NamedOpd = { id: string; code: string | null; name: string };
type UPTDMatch = { id: string; opdId: string; name: string; code: string | null; score: number; terms: string[]; isPrimary: boolean };

export type PrintV16RoutingResult = {
  engine: typeof PRINT_CLASSIFICATION_VERSION;
  generatedAt: string;
  routingStatus: 'ROUTED' | 'AMBIGUOUS' | 'UNROUTED';
  primaryOpdId: string | null;
  primaryOpdName: string | null;
  primaryOpdCode: string | null;
  supportingOpdIds: string[];
  supportingOpds: NamedOpd[];
  uptdId: string | null;
  uptdName: string | null;
  uptdMatches: UPTDMatch[];
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

function normalize(value: string): string {
  return String(value || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function containsPhrase(text: string, phrase: string): boolean {
  const t = ` ${normalize(text)} `, p = normalize(phrase);
  return p.length >= 2 && t.includes(` ${p} `);
}
function uptdTerms(row: { name?: string; code?: string; aliases?: unknown }): string[] {
  const out = new Set<string>();
  for (const raw of [row.name, row.code, ...(Array.isArray(row.aliases) ? row.aliases : [])]) {
    const term = normalize(String(raw || ''));
    if (term.length >= 3) out.add(term);
  }
  return [...out];
}
function controlledOcrLead(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const cut = text.search(/\b(?:baca juga|pewarta\s*:|editor\s*:|copyright\b|iklan\b|advertorial\b)\b/i);
  return (cut >= 0 ? text.slice(0, cut) : text).slice(0, 900);
}

/** Print adapter for the stable V16.5 Context Dominance engine. Decision-only; no mutations. */
export async function analyzePrintRoutingV16(pool: Pool, input: PrintV16Input): Promise<PrintV16RoutingResult> {
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const ocrLead = summary ? '' : controlledOcrLead(String(input.bodyText || ''));
  const routingLead = summary || ocrLead;
  const evidenceSource: PrintV16RoutingResult['evidenceSource'] = summary ? 'TITLE_SUMMARY' : 'TITLE_OCR_LEAD';
  const headlineTaxonomies = await getV16HeadlineTaxonomies(pool, title);
  const evidence = await getV16PrimaryEvidenceForInput(pool, { title, summary: routingLead, content: '', manualKeywordIds: [] });

  const empty = {
    primaryOpdId: null, primaryOpdName: null, primaryOpdCode: null,
    supportingOpdIds: [] as string[], supportingOpds: [] as NamedOpd[],
    uptdId: null, uptdName: null, uptdMatches: [] as UPTDMatch[],
  };

  if (!evidence) {
    const routingStatus: PrintV16RoutingResult['routingStatus'] = headlineTaxonomies.length ? 'AMBIGUOUS' : 'UNROUTED';
    return {
      engine: PRINT_CLASSIFICATION_VERSION, generatedAt: new Date().toISOString(), routingStatus, ...empty,
      keywordId: null, keyword: null,
      taxonomyId: headlineTaxonomies[0]?.id || null, taxonomyName: headlineTaxonomies[0]?.name || null,
      matchType: null, score: 0, headlineTaxonomies, needsVerification: true, evidenceSource,
      note: headlineTaxonomies.length
        ? 'Headline taxonomy terdeteksi, tetapi belum ada Master Classification evidence yang cukup untuk Primary OPD.'
        : 'Tidak ada Master Classification evidence atau headline taxonomy yang cukup untuk menentukan Primary OPD.',
    };
  }

  const routedIds = [...new Set([evidence.opdId, ...evidence.supportingOpdIds])];
  const opdRows = (await pool.query(`SELECT id,code,name FROM opd WHERE id=ANY($1::bigint[])`, [routedIds])).rows;
  const opdMap = new Map(opdRows.map((r: any) => [String(r.id), { id: String(r.id), code: r.code ? String(r.code) : null, name: String(r.name || '') }]));
  const primaryOpd = opdMap.get(String(evidence.opdId)) || null;
  const supportingOpds = evidence.supportingOpdIds.map(id => opdMap.get(String(id))).filter(Boolean) as NamedOpd[];

  // Same UPTD evidence policy as Online atomic-router-v16: active UPTD under routed OPDs,
  // exact name/code/alias phrase in title (24) or verified lead (16), threshold >=16.
  const units = (await pool.query(`SELECT id,opd_id,name,code,aliases FROM uptd WHERE active=true AND opd_id=ANY($1::bigint[]) ORDER BY id`, [routedIds])).rows;
  const matches: UPTDMatch[] = [];
  for (const unit of units) {
    let score = 0; const terms: string[] = [];
    for (const term of uptdTerms(unit)) {
      const points = containsPhrase(title, term) ? 24 : containsPhrase(routingLead, term) ? 16 : 0;
      if (points) { score += points; terms.push(term); }
    }
    if (score >= 16) matches.push({ id: String(unit.id), opdId: String(unit.opd_id), name: String(unit.name || ''), code: unit.code ? String(unit.code) : null, score, terms, isPrimary: false });
  }
  matches.sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id));
  const primaryUnit = matches.find(u => u.opdId === String(evidence.opdId)) || null;
  for (const unit of matches) unit.isPrimary = unit.id === primaryUnit?.id;

  return {
    engine: PRINT_CLASSIFICATION_VERSION, generatedAt: new Date().toISOString(), routingStatus: 'ROUTED',
    primaryOpdId: evidence.opdId, primaryOpdName: primaryOpd?.name || null, primaryOpdCode: primaryOpd?.code || null,
    supportingOpdIds: evidence.supportingOpdIds, supportingOpds,
    uptdId: primaryUnit?.id || null, uptdName: primaryUnit?.name || null, uptdMatches: matches,
    keywordId: evidence.keywordId, keyword: evidence.keyword,
    taxonomyId: evidence.taxonomyId, taxonomyName: evidence.taxonomyName,
    matchType: evidence.matchType, score: evidence.score, headlineTaxonomies, needsVerification: false, evidenceSource,
    note: 'Routing Media Cetak menggunakan Master Classification dan Context Dominance V16.5. UPTD memakai aturan evidence V16.5 yang sama dengan Online. Full OCR body tidak digunakan sebagai evidence routing.',
  };
}
