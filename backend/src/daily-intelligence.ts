import { Pool } from 'pg';
import { analyzeArticle, rankDailyHighlights, topNarrativeTerms, type IntelligenceArticle } from './media-intelligence-core.js';

type DailyArticle = IntelligenceArticle & {
  source_name?: string | null;
  source_tier?: number | null;
  media_kind?: 'online' | 'print' | 'social' | null;
  opd_name?: string | null;
  sentiment?: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
  impact_score?: number | null;
  velocity_score?: number | null;
  importance_score?: number | null;
  url?: string | null;
};

function statusFromRisk(score: number) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'ESCALATING';
  if (score >= 35) return 'WATCH';
  return 'NORMAL';
}

function responseWindow(score: number) {
  if (score >= 80) return '0–1 JAM';
  if (score >= 60) return '1–6 JAM';
  if (score >= 35) return '6–24 JAM';
  return 'MONITOR';
}

export async function generateDailyIntelligence(pool: Pool, date = new Date().toISOString().slice(0, 10), opdId?: string | null) {
  const params: unknown[] = [date];
  const where = [`a.published_at >= $1::date`, `a.published_at < ($1::date + INTERVAL '1 day')`];
  if (opdId) { params.push(opdId); where.push(`a.opd_id=$${params.length}`); }
  const { rows } = await pool.query(`SELECT a.id,a.title,a.summary,a.content,a.url,a.published_at,a.sentiment,a.risk_score,a.risk_level,a.impact_score,a.velocity_score,a.importance_score,ms.name source_name,ms.tier source_tier,ms.category media_kind,o.name opd_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id WHERE ${where.join(' AND ')} ORDER BY a.published_at DESC`, params);
  const articles = rows as DailyArticle[];
  const analyses = articles.map(article => analyzeArticle(article));
  const ranked = rankDailyHighlights(articles, analyses);
  const highlights = ranked.slice(0, 10).map(({ article, analysis }) => ({ id: article.id, title: article.title, url: article.url ?? null, source: article.source_name ?? 'Unknown', opd: article.opd_name ?? null, publishedAt: article.publishedAt ?? null, sentiment: analysis.sentiment, riskScore: analysis.riskScore, riskLevel: analysis.riskLevel, impactScore: analysis.impactScore, velocityScore: analysis.velocityScore, importanceScore: analysis.importanceScore }));
  const negative = [...articles].sort((a,b) => Number(b.risk_score ?? 0) - Number(a.risk_score ?? 0)).filter(a => a.sentiment === 'negative').slice(0, 5);
  const sources = new Map<string, number>();
  const opds = new Map<string, number>();
  for (const article of articles) {
    if (article.source_name) sources.set(article.source_name, (sources.get(article.source_name) ?? 0) + 1);
    if (article.opd_name) opds.set(article.opd_name, (opds.get(article.opd_name) ?? 0) + 1);
  }
  const sourceSpread = [...sources.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([name,count]) => ({name,count}));
  const opdSpread = [...opds.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([name,count]) => ({name,count}));
  const top = ranked[0]?.analysis;
  const topArticle = ranked[0]?.article;
  const avgRisk = articles.length ? Math.round(articles.reduce((sum,a) => sum + Number(a.risk_score ?? 0), 0) / articles.length) : 0;
  const negativeCount = articles.filter(a => a.sentiment === 'negative').length;
  const highRiskCount = articles.filter(a => ['high','critical'].includes(String(a.risk_level))).length;
  const status = statusFromRisk(Math.max(avgRisk, Number(top?.riskScore ?? 0)));
  const result = {
    date,
    generatedAt: new Date().toISOString(),
    scope: { opdId: opdId ?? null },
    status,
    responseWindow: responseWindow(Number(top?.riskScore ?? avgRisk)),
    metrics: { totalArticles: articles.length, negativeCount, highRiskCount, sourceCount: sources.size, opdCount: opds.size, averageRisk: avgRisk, mediaSpread: sourceSpread.length },
    dailyHighlight: highlights[0] ?? null,
    highlights,
    topNegative: negative.map(a => ({ id:a.id,title:a.title,source:a.source_name ?? 'Unknown',riskScore:Number(a.risk_score ?? 0),url:a.url ?? null })),
    topIssue: topArticle ? { title: topArticle.title, source: topArticle.source_name ?? 'Unknown', opd: topArticle.opd_name ?? null, riskScore: Number(top?.riskScore ?? 0), impactScore: Number(top?.impactScore ?? 0) } : null,
    topMedia: sourceSpread[0] ?? null,
    topOpd: opdSpread[0] ?? null,
    mediaSpread: sourceSpread,
    opdSpread,
    narrativeMovement: topNarrativeTerms(articles, 15),
    executiveBrief: topArticle ? `Hari ini terdeteksi ${articles.length} pemberitaan. Fokus utama adalah “${topArticle.title}”. Tingkat status ${status} dengan kebutuhan respons ${responseWindow(Number(top?.riskScore ?? avgRisk))}. ${negativeCount} pemberitaan bernada negatif dan ${highRiskCount} berada pada risiko tinggi/kritis.` : 'Belum ada pemberitaan terdeteksi pada periode ini.',
    recommendedActions: topArticle ? [
      Number(top?.riskScore ?? 0) >= 60 ? 'Validasi fakta dan tetapkan PIC lintas-OPD segera.' : 'Pantau perkembangan isu dan siapkan data pendukung.',
      Number(top?.riskScore ?? 0) >= 60 ? 'Siapkan holding statement dan satu narasi resmi.' : 'Pastikan kanal resmi memiliki informasi yang konsisten.',
      'Pantau media yang memperluas isu dan identifikasi potensi eskalasi berikutnya.'
    ] : ['Pastikan sumber media aktif dan ingestion berjalan normal.'],
    disclaimer: 'Analisis bersifat decision support. Verifikasi fakta dan konteks lapangan tetap diperlukan sebelum keputusan resmi.'
  };

  await pool.query(`INSERT INTO daily_intelligence_runs(run_date,opd_id,status,payload,created_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(run_date,opd_id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,created_at=NOW()`, [date, opdId ?? null, status, result]);
  return result;
}
