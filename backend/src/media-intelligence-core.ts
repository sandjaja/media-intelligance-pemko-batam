export type MediaKind = 'online' | 'print' | 'social';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type IntelligenceArticle = {
  id: string | number;
  title: string;
  summary?: string | null;
  content?: string | null;
  sourceName?: string | null;
  sourceTier?: number | null;
  mediaKind?: MediaKind | null;
  opdId?: string | number | null;
  publishedAt?: string | Date | null;
};

export type KeywordQuery = { and: string[]; or: string[]; not: string[]; exact: string[] };
export type ArticleAnalysis = { sentiment: Sentiment; sentimentScore: number; impactScore: number; riskScore: number; riskLevel: RiskLevel; importanceScore: number; velocityScore: number; matchedKeywords: string[]; entities: string[]; duplicateFingerprint: string };

const STOPWORDS = new Set(['yang','dan','atau','dengan','untuk','dari','pada','dalam','ini','itu','akan','telah','oleh','karena','sebagai','tidak','ada','lebih','juga','sudah','agar','jadi','kepada','bagi','dapat','bisa','sebuah','para','kami','kita','mereka','menjadi','tentang','setelah','sebelum','saat','hari','di','ke','the','of','and','to','in','on','a','an']);
const NEGATIVE = new Map([['korupsi',18],['suap',20],['gagal',12],['kriminal',16],['kecelakaan',14],['banjir',14],['macet',10],['protes',14],['keluhan',10],['kritik',8],['masalah',8],['terlambat',9],['lambat',7],['kebakaran',15],['ancaman',15],['sengketa',13],['krisis',18],['darurat',18],['kerugian',14],['cacat',10],['polemik',11]]);
const POSITIVE = new Map([['berhasil',12],['sukses',12],['prestasi',12],['penghargaan',10],['meningkat',8],['investasi',12],['terobosan',10],['apresiasi',10],['aman',7],['lancar',7],['kolaborasi',8],['pertumbuhan',10],['inovasi',9],['pelayanan',5],['perbaikan',7]]);

function normalize(value: string) { return value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function tokens(value: string) { return normalize(value).split(/\s+/).filter(Boolean); }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function containsTerm(haystack: string, term: string) { const normalized = normalize(term); if (!normalized) return false; return normalized.includes(' ') ? haystack.includes(normalized) : new RegExp(`(?:^|\\s)${escapeRegExp(normalized)}(?:$|\\s)`, 'u').test(haystack); }

export function parseKeywordQuery(input: string): KeywordQuery {
  const result: KeywordQuery = { and: [], or: [], not: [], exact: [] };
  const parts = input.match(/"[^"\n]+"|\S+/g) ?? [];
  for (const raw of parts) {
    const exact = raw.startsWith('"') && raw.endsWith('"');
    const value = exact ? raw.slice(1, -1).trim() : raw;
    if (!value) continue;
    if (value.startsWith('-')) result.not.push(value.slice(1));
    else if (value.includes('|')) result.or.push(...value.split('|').map(v => v.trim()).filter(Boolean));
    else if (exact) result.exact.push(value);
    else result.and.push(value);
  }
  return result;
}

export function matchesKeywordQuery(article: IntelligenceArticle, query: KeywordQuery) {
  const haystack = normalize([article.title, article.summary ?? '', article.content ?? ''].join(' '));
  return query.and.every(term => containsTerm(haystack, term)) && (query.or.length === 0 || query.or.some(term => containsTerm(haystack, term))) && query.exact.every(term => haystack.includes(normalize(term))) && query.not.every(term => !containsTerm(haystack, term));
}
export function matchedKeywords(article: IntelligenceArticle, query: KeywordQuery) { const haystack = normalize([article.title, article.summary ?? '', article.content ?? ''].join(' ')); return [...new Set([...query.and, ...query.or, ...query.exact].filter(term => containsTerm(haystack, term)))]; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

export function fingerprintArticle(article: IntelligenceArticle) {
  const title = tokens(article.title).filter(t => t.length > 2 && !STOPWORDS.has(t)).slice(0, 24).sort();
  return title.join('|');
}

export function analyzeArticle(article: IntelligenceArticle, query: KeywordQuery = { and: [], or: [], not: [], exact: [] }, peerCount = 1): ArticleAnalysis {
  const text = normalize([article.title, article.summary ?? '', article.content ?? ''].join(' '));
  let positive = 0; let negative = 0;
  for (const [term, weight] of POSITIVE) if (containsTerm(text, term)) positive += weight;
  for (const [term, weight] of NEGATIVE) if (containsTerm(text, term)) negative += weight;
  const total = positive + negative;
  const sentimentScore = clamp(total === 0 ? 0 : ((positive - negative) / total) * 100);
  const sentiment: Sentiment = negative > positive * 1.15 ? 'negative' : positive > negative * 1.15 ? 'positive' : 'neutral';
  const titleBoost = Math.min(20, tokens(article.title).length * 1.5);
  const sourceBoost = article.sourceTier ? Math.max(0, 15 - article.sourceTier * 4) : 4;
  const spreadBoost = Math.min(25, Math.log2(Math.max(1, peerCount)) * 8);
  const riskScore = clamp(20 + negative * 0.9 + titleBoost * 0.6 + spreadBoost * 0.7);
  const impactScore = clamp(25 + titleBoost + sourceBoost + spreadBoost);
  const importanceScore = clamp(riskScore * 0.45 + impactScore * 0.4 + (article.mediaKind === 'print' ? 8 : 0));
  const velocityScore = clamp(Math.min(100, 20 + peerCount * 10));
  const riskLevel: RiskLevel = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 35 ? 'medium' : 'low';
  return { sentiment, sentimentScore, impactScore, riskScore, riskLevel, importanceScore, velocityScore, matchedKeywords: matchedKeywords(article, query), entities: extractEntities(article), duplicateFingerprint: fingerprintArticle(article) };
}

export function extractEntities(article: IntelligenceArticle) {
  const text = [article.title, article.summary ?? '', article.content ?? ''].join(' ');
  const matches = text.match(/\b(?:Pemko|Pemerintah Kota|Dinas|Badan|DPMPTSP|Diskominfo|Dinkes|Dishub|Disdik|Batam|Wali Kota|Wakil Wali Kota)\b(?:\s+[A-Z][\p{L}\-]+){0,4}/gu) ?? [];
  return [...new Set(matches.map(v => v.trim()))].slice(0, 20);
}
export function detectDuplicates(articles: IntelligenceArticle[]) { const groups = new Map<string, IntelligenceArticle[]>(); for (const article of articles) { const key = fingerprintArticle(article); if (!key) continue; const group = groups.get(key) ?? []; group.push(article); groups.set(key, group); } return [...groups.entries()].filter(([, group]) => group.length > 1).map(([fingerprint, group]) => ({ fingerprint, articles: group })); }
export function rankDailyHighlights(articles: IntelligenceArticle[], analyses: ArticleAnalysis[]) { return articles.map((article, index) => ({ article, analysis: analyses[index] })).sort((a, b) => (b.analysis.riskScore + b.analysis.impactScore + b.analysis.velocityScore) - (a.analysis.riskScore + a.analysis.impactScore + a.analysis.velocityScore)).slice(0, 10); }
export function topNarrativeTerms(articles: IntelligenceArticle[], limit = 15) { const counts = new Map<string, number>(); for (const article of articles) { const unique = new Set(tokens([article.title, article.summary ?? ''].join(' ')).filter(t => t.length >= 4 && !STOPWORDS.has(t))); for (const token of unique) counts.set(token, (counts.get(token) ?? 0) + 1); } return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count })); }
