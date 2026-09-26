import { Pool } from 'pg';

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

async function providerBrief(rows: IntelligenceArticle[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const input = rows.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: 'Anda adalah analis media intelligence untuk pemerintah daerah. Buat executive brief singkat, faktual, tidak mengarang fakta, dan pisahkan fakta dari rekomendasi. Output JSON dengan keys headline, situation, implications, actions (array), key_message, priority. Priority hanya WATCH, MEDIUM, HIGH, IMMEDIATE.' }] },
        { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(input) }] }
      ],
      text: { format: { type: 'json_object' } },
      max_output_tokens: 900
    })
  });
  if (!response.ok) throw new Error(`AI provider HTTP ${response.status}`);
  const payload = await response.json() as any;
  const text = payload.output_text || payload.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === 'output_text')?.text;
  if (!text) throw new Error('AI provider returned no text');
  return { mode: 'ai', ...JSON.parse(text) };
}

export async function getExecutiveBrief(pool: Pool, opdId: string | null = null) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opdId) { params.push(opdId); where.push(`a.opd_id=$${params.length}`); }
  params.push(20);
  const { rows } = await pool.query(`SELECT a.id,a.title,a.summary,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,a.risk_score,a.risk_level,ms.name source_name,o.name opd_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.risk_score DESC,a.impact_score DESC,a.importance_score DESC,a.published_at DESC NULLS LAST LIMIT $${params.length}`, params);
  const data = rows.map(r => ({ ...r, id: String(r.id), importance_score: num(r.importance_score), impact_score: num(r.impact_score), velocity_score: num(r.velocity_score), risk_score: num(r.risk_score) })) as IntelligenceArticle[];
  try { return await providerBrief(data) ?? fallbackBrief(data); } catch { return { ...fallbackBrief(data), mode: 'deterministic-fallback', provider_error: true }; }
}
