import { Pool } from 'pg';
import { decryptIntegrationCredential } from './integration-credentials.js';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';

export type IntelligenceArticle = {
  id: string;
  title: string;
  summary: string | null;
  source_name: string | null;
  published_at: string | null;
  sentiment: string | null;
  importance_score: number;
  impact_score: number;
  velocity_score: number;
  risk_score: number;
  risk_level: string;
  opd_name: string | null;
};

function num(v: unknown) { return Number(v ?? 0); }

function fallbackBrief(rows: IntelligenceArticle[]) {
  const top = rows[0];
  const critical = rows.filter(r => ['critical', 'high'].includes(String(r.risk_level).toLowerCase()));
  const negative = rows.filter(r => String(r.sentiment).toLowerCase() === 'negative');
  if (!top) return {
    mode: 'deterministic-fallback',
    headline: 'Belum ada sinyal media yang cukup untuk Executive Brief.',
    situation: 'Database belum memiliki artikel yang dapat dianalisis.',
    implications: 'Tidak ada implikasi risiko yang dapat disimpulkan.',
    actions: ['Pastikan feed media aktif.', 'Jalankan monitoring untuk memperoleh sinyal terbaru.'],
    key_message: 'Pemko terus memantau perkembangan informasi dan akan menyampaikan informasi resmi melalui kanal pemerintah.',
    priority: 'WATCH'
  };
  const priority = critical.some(r => String(r.risk_level).toLowerCase() === 'critical') ? 'IMMEDIATE' : critical.length ? 'HIGH' : negative.length ? 'MEDIUM' : 'WATCH';
  const actions = priority === 'IMMEDIATE'
    ? ['Validasi fakta lintas OPD segera.', 'Tetapkan satu juru bicara.', 'Siapkan holding statement dan Q&A.', 'Pantau eskalasi pemberitaan secara real-time.']
    : priority === 'HIGH'
      ? ['Validasi fakta dan dampak publik.', 'Siapkan key message lintas OPD.', 'Pantau follow-up media dan momentum narasi.']
      : ['Monitor perkembangan.', 'Siapkan konteks dan data pendukung bila isu berkembang.'];
  return {
    mode: 'deterministic-fallback',
    headline: top.title,
    situation: `${top.source_name || 'Media'} memuat sinyal dengan risk ${num(top.risk_score)}/100, impact ${num(top.impact_score)}/100 dan velocity ${num(top.velocity_score)}/100.`,
    implications: `${negative.length} berita negatif dan ${critical.length} berita high/critical berada dalam kumpulan sinyal teratas.`,
    actions,
    key_message: String(top.sentiment).toLowerCase() === 'negative'
      ? 'Pemko memahami perhatian publik, sedang melakukan verifikasi fakta dan koordinasi penanganan, serta akan menyampaikan perkembangan melalui kanal resmi.'
      : 'Pemko terus memperkuat penyampaian informasi berbasis data dan memastikan perkembangan dapat diverifikasi publik.',
    priority
  };
}

async function providerBrief(pool: Pool, rows: IntelligenceArticle[]) {
  const credential = await pool.query(
    "SELECT c.credential_ciphertext FROM ai_provider_credentials c JOIN ai_providers p ON p.id=c.provider_id WHERE p.code='gemini' AND p.enabled=TRUE LIMIT 1",
  );
  if (!credential.rows[0]) return null;
  const key = decryptIntegrationCredential(credential.rows[0].credential_ciphertext);
  const models = await pool.query(
    "SELECT m.code FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id WHERE p.code='gemini' AND p.enabled=TRUE AND m.enabled=TRUE ORDER BY m.id LIMIT 1",
  );
  if (!models.rows[0]) return null;
  const model = models.rows[0].code as string;
  const input = rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }));
  const prompt = 'Anda adalah analis media intelligence pemerintah daerah. Buat executive brief singkat, faktual, tidak mengarang fakta, pisahkan fakta dan rekomendasi. Kembalikan JSON dengan keys headline, situation, implications, actions (array), key_message, priority. Priority hanya WATCH, MEDIUM, HIGH, IMMEDIATE.\nDATA:\\n' + JSON.stringify(input);
  await reserveGeminiDailyRequest(pool, model, 'executive_brief');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const category = response.status === 401 || response.status === 403 ? 'AUTH'
      : response.status === 404 ? 'MODEL_NOT_FOUND'
      : response.status === 429 ? 'RATE_LIMIT'
      : response.status >= 500 ? 'UPSTREAM' : 'REQUEST_REJECTED';
    throw new Error('GEMINI_' + category + '_' + response.status);
  }
  const payload = await response.json() as any;
  const raw = payload.candidates?.[0]?.content?.parts?.map((x: any) => x.text || '').join('').trim();
  if (!raw) throw new Error('GEMINI_EMPTY_RESPONSE');
  // Keep the Executive Brief schema unchanged; accept Gemini JSON with optional markdown fences.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); }
  catch { throw new Error('GEMINI_INVALID_JSON_RESPONSE'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('GEMINI_INVALID_JSON_RESPONSE');
  return { ...(parsed as Record<string, unknown>), mode: 'ai', model_code: model, source_count: input.length };
}

export async function getExecutiveBrief(pool: Pool, opdId: string | null = null): Promise<Record<string, unknown>> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opdId) { params.push(opdId); where.push(`a.opd_id=$${params.length}`); }
  params.push(20);
  const { rows } = await pool.query(`SELECT a.id,a.title,a.summary,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,a.risk_score,a.risk_level,ms.name source_name,o.name opd_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.risk_score DESC,a.impact_score DESC,a.importance_score DESC,a.published_at DESC NULLS LAST LIMIT $${params.length}`, params);
  const data = rows.map(r => ({ ...r, id: String(r.id), importance_score: num(r.importance_score), impact_score: num(r.impact_score), velocity_score: num(r.velocity_score), risk_score: num(r.risk_score) })) as IntelligenceArticle[];
  try { return await providerBrief(pool, data) ?? { ...fallbackBrief(data), provider_error_code: 'GEMINI_NOT_CONFIGURED' }; }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /^GEMINI_(?:AUTH|MODEL_NOT_FOUND|RATE_LIMIT|UPSTREAM|REQUEST_REJECTED)_\d{3}$/.test(message)
      || message === 'GEMINI_EMPTY_RESPONSE' || message === 'GEMINI_INVALID_JSON_RESPONSE' ? message : 'GEMINI_PROVIDER_ERROR';
    return { ...fallbackBrief(data), provider_error: true, provider_error_code: code };
  }
}
