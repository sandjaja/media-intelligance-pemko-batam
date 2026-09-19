import type { IntelligenceArticle } from './media-intelligence-core.js';

export type PrintDailyScan = {
  id: string | number;
  title: string;
  summary: string | null;
  content: string | null;
  url: string | null;
  published_at: string | null;
  sentiment: string | null;
  risk_score: number | null;
  risk_level: string | null;
  impact_score: number | null;
  velocity_score: number | null;
  importance_score: number | null;
  source_name: string | null;
  source_tier: number | null;
  media_kind: 'print';
  opd_id: string | number | null;
  opd_name: string | null;
};

export function normalizePrintScan(row: any): PrintDailyScan {
  const a = row.analysis ?? {};
  const date = a.edition_date || row.created_at || null;
  return {
    id: `print-${row.id}`,
    title: String(a.headline || row.file_name || 'Media cetak terdeteksi'),
    summary: a.summary ? String(a.summary) : null,
    content: row.ocr_text ? String(row.ocr_text) : null,
    url: null,
    published_at: date,
    sentiment: a.sentiment ? String(a.sentiment) : null,
    risk_score: Number(a.risk_score ?? 0),
    risk_level: a.risk_level ? String(a.risk_level) : 'low',
    impact_score: Number(a.impact_score ?? 0),
    velocity_score: Number(a.velocity_score ?? 0),
    importance_score: Number(a.importance_score ?? 0),
    source_name: a.media_name ? String(a.media_name) : 'Media Cetak',
    source_tier: 1,
    media_kind: 'print',
    opd_id: row.opd_id ?? a.opd_id ?? null,
    opd_name: row.opd_name ?? a.opd_name ?? null,
  };
}

export function printToIntelligenceArticle(row: PrintDailyScan): IntelligenceArticle {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    sourceName: row.source_name,
    sourceTier: row.source_tier,
    mediaKind: 'print',
    opdId: row.opd_id,
    publishedAt: row.published_at,
  };
}
