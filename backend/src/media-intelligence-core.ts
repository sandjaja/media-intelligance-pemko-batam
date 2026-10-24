import { calculateRisk } from './risk.js';
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

export function normalizedPeerCount(value: unknown): number { const n=Number(value); return Number.isFinite(n)&&n>0?Math.max(1,Math.round(n)):1; }

export function scoringPeerCount(): number { return 1; }

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
function clampSigned(value: number) { return Math.max(-100, Math.min(100, Math.round(value))); }

const PUBLIC_ACTOR = /\b(?:pemko|pemerintah kota|wali kota|wakil wali kota|dinas|badan|bagian|opd|camat|kecamatan|lurah|kelurahan|pelayanan publik)\b/u;
const ACCOUNTABILITY_NEGATIVE = /\b(?:dinilai|dikritik|dikeluhkan|keluhan|protes|lambat|terlambat|gagal|lalai|abai|korupsi|suap|polemik|sengketa)\b/u;
const RESPONSE_POSITIVE = /\b(?:menangani|mengatasi|memperbaiki|perbaikan|menindaklanjuti|merespons|respon|antisipasi|mencegah|pencegahan|memastikan|imbau|mengimbau|menjaga|aman|lancar|berhasil|apresiasi)\b/u;
const EXTERNAL_HAZARD = /\b(?:kabut asap|kualitas udara|banjir|kebakaran|kecelakaan|krisis|darurat|ancaman)\b/u;

export function fingerprintArticle(article: IntelligenceArticle) {
  const title = tokens(article.title).filter(t => t.length > 2 && !STOPWORDS.has(t)).slice(0, 24).sort();
  return title.join('|');
}

export function analyzeArticle(article: IntelligenceArticle, query: KeywordQuery = { and: [], or: [], not: [], exact: [] }, peerCount = scoringPeerCount()): ArticleAnalysis {
  peerCount=normalizedPeerCount(peerCount);
  const text = normalize([article.title, article.summary ?? '', article.content ?? ''].join(' '));
  let positive = 0; let negative = 0;
  for (const [term, weight] of POSITIVE) if (containsTerm(text, term)) positive += weight;
  for (const [term, weight] of NEGATIVE) if (containsTerm(text, term)) negative += weight;
  const total = positive + negative;
  const hasPublicActor = PUBLIC_ACTOR.test(text) || article.opdId != null;
  const accountabilityNegative = hasPublicActor && ACCOUNTABILITY_NEGATIVE.test(text);
  const responsePositive = hasPublicActor && RESPONSE_POSITIVE.test(text);
  const externalHazard = EXTERNAL_HAZARD.test(text);
  // Sentiment is direction toward government/service response, not topic valence.
  // A hazard by itself (e.g. kabut asap) stays neutral unless the text attributes
  // failure/criticism or a clearly positive response to the public actor.
  let sentiment: Sentiment = 'neutral';
  if (accountabilityNegative && !responsePositive) sentiment = 'negative';
  else if (responsePositive && !accountabilityNegative) sentiment = 'positive';
  else if (!externalHazard && hasPublicActor) sentiment = negative > positive * 1.15 ? 'negative' : positive > negative * 1.15 ? 'positive' : 'neutral';
  else if (!hasPublicActor && !externalHazard) sentiment = negative > positive * 1.15 ? 'negative' : positive > negative * 1.15 ? 'positive' : 'neutral';
  const lexicalScore = total === 0 ? 0 : ((positive - negative) / total) * 100;
  const sentimentScore = clampSigned(sentiment === 'neutral' ? 0 : sentiment === 'negative' ? -Math.abs(lexicalScore || 50) : Math.abs(lexicalScore || 50));
  // Importance and impact are semantic inputs. Do not use source tier/media type
  // or headline length as risk proxies: the same event must score consistently
  // across Online, Print, Social and Owned.
  const strategicPublicService = /\b(?:pelayanan publik|layanan publik|air bersih|air minum|listrik|jalan|jembatan|transportasi|angkutan|sampah|limbah|drainase|banjir|kesehatan|rumah sakit|puskesmas|pendidikan|sekolah|perizinan|administrasi kependudukan|pemadam|kebakaran)\b/u.test(text);
  const leadershipOrPolicy = /\b(?:wali kota|wakil wali kota|sekretaris daerah|sekda|kebijakan|peraturan|anggaran|apbd|program prioritas|proyek strategis|investasi|pelayanan publik)\b/u.test(text);
  const accountabilityOrIntegrity = /\b(?:korupsi|suap|gratifikasi|pungli|penyalahgunaan|tersangka|penyidikan|audit|temuan|keluhan|dikeluhkan|protes|kritik|dikritik|gagal|lalai|abai|polemik|sengketa)\b/u.test(text);
  const emergencyOrSafety = /\b(?:kebakaran|banjir|kecelakaan|bencana|darurat|krisis|longsor|tenggelam|tewas|meninggal|korban|luka|parang|ancaman|evakuasi|penyelamatan|kabut asap|kualitas udara)\b/u.test(text);
  const serviceDisruption = /\b(?:padam|pemadaman|terputus|gangguan layanan|terganggu|tidak beroperasi|ditutup|lumpuh|macet|terhambat|kekurangan air|kebocoran|rusak|tergenang)\b/u.test(text);
  const economicOrEnvironmentalImpact = /\b(?:kerugian|rugi|ekonomi|investasi|usaha|pekerja|buruh|phk|pencemaran|limbah|lingkungan|kualitas udara|lahan terbakar)\b/u.test(text);
  const broadReach = /\b(?:warga|masyarakat|publik|ribuan|ratusan|sejumlah wilayah|beberapa wilayah|kecamatan|kelurahan)\b/u.test(text);
  const multiAgency = /\b(?:lintas opd|antar opd|bersama dinas|pemko bersama|tim gabungan|forkopimda)\b/u.test(text);

  let importance = 20;
  if (hasPublicActor) importance += 15;
  if (strategicPublicService) importance += 20;
  if (leadershipOrPolicy) importance += 15;
  if (accountabilityOrIntegrity) importance += 20;
  if (emergencyOrSafety) importance += 15;
  if (multiAgency) importance += 10;
  // Repeated independent coverage is evidence that a subject is becoming strategically important.
  importance += Math.min(15, Math.max(0, peerCount - 1) * 3);
  const importanceScore = clamp(importance);

  let impact = 20;
  if (strategicPublicService) impact += 15;
  if (emergencyOrSafety) impact += 25;
  if (serviceDisruption) impact += 20;
  if (economicOrEnvironmentalImpact) impact += 15;
  if (broadReach) impact += 10;
  if (accountabilityOrIntegrity) impact += 10;
  impact += Math.min(10, Math.max(0, peerCount - 1) * 2);
  const impactScore = clamp(impact);

  // Article velocity is a snapshot at analysis time. Issue velocity remains the
  // dynamic layer; locking an article freezes this snapshot.
  const velocityScore = clamp(Math.min(100, 20 + peerCount * 10));
  const risk = calculateRisk({ importance: importanceScore, impact: impactScore, velocity: velocityScore, sentiment, sentimentScore });
  const riskScore = risk.score;
  const riskLevel: RiskLevel = risk.level;
  return { sentiment, sentimentScore, impactScore, riskScore, riskLevel, importanceScore, velocityScore, matchedKeywords: matchedKeywords(article, query), entities: extractEntities(article), duplicateFingerprint: fingerprintArticle(article) };
}

export function extractEntities(article: IntelligenceArticle) {
  const text = [article.title, article.summary ?? '', article.content ?? ''].join(' ');
  const matches = text.match(/\b(?:Pemko|Pemerintah Kota|Pemerintah Kabupaten|Pemkab|Dinas|Badan|DPMPTSP|Diskominfo|Dinkes|Dishub|Disdik|Wali Kota|Wakil Wali Kota|Bupati|Wakil Bupati)\b(?:\s+[A-Z][\p{L}\-]+){0,4}/gu) ?? [];
  return [...new Set(matches.map(v => v.trim()))].slice(0, 20);
}
export function detectDuplicates(articles: IntelligenceArticle[]) { const groups = new Map<string, IntelligenceArticle[]>(); for (const article of articles) { const key = fingerprintArticle(article); if (!key) continue; const group = groups.get(key) ?? []; group.push(article); groups.set(key, group); } return [...groups.entries()].filter(([, group]) => group.length > 1).map(([fingerprint, group]) => ({ fingerprint, articles: group })); }
export function rankDailyHighlights(articles: IntelligenceArticle[], analyses: ArticleAnalysis[]) { return articles.map((article, index) => ({ article, analysis: analyses[index] })).sort((a, b) => (b.analysis.riskScore + b.analysis.impactScore + b.analysis.velocityScore) - (a.analysis.riskScore + a.analysis.impactScore + a.analysis.velocityScore)).slice(0, 10); }
export function topNarrativeTerms(articles: IntelligenceArticle[], limit = 15) { const counts = new Map<string, number>(); for (const article of articles) { const unique = new Set(tokens([article.title, article.summary ?? ''].join(' ')).filter(t => t.length >= 4 && !STOPWORDS.has(t))); for (const token of unique) counts.set(token, (counts.get(token) ?? 0) + 1); } return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count })); }
