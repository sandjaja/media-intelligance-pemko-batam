import { Pool } from 'pg';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export function calculateRisk(input: { importance: number; impact: number; velocity: number; sentiment: string | null; tier: number }): { score: number; level: RiskLevel; reasons: string[]; alertType: string | null } {
  let score = 0;
  const reasons: string[] = [];
  if (input.sentiment === 'negative') { score += 30; reasons.push('Sentimen negatif'); }
  if (input.importance >= 80) { score += 25; reasons.push('Importance tinggi'); }
  else if (input.importance >= 65) { score += 15; reasons.push('Importance menengah-tinggi'); }
  if (input.impact >= 75) { score += 25; reasons.push('Dampak publik tinggi'); }
  else if (input.impact >= 55) { score += 15; reasons.push('Dampak publik signifikan'); }
  if (input.velocity >= 75) { score += 20; reasons.push('Momentum pemberitaan tinggi'); }
  else if (input.velocity >= 50) { score += 10; reasons.push('Momentum pemberitaan meningkat'); }
  if (input.tier === 1) { score += 10; reasons.push('Sumber media Tier 1'); }
  score = Math.min(100, score);
  const level: RiskLevel = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  const alertType = level === 'critical' ? 'CRITICAL_MEDIA_RISK' : level === 'high' ? 'HIGH_MEDIA_RISK' : null;
  return { score, level, reasons, alertType };
}

export async function applyRisk(pool: Pool, articleId: string) {
  const row = (await pool.query(`SELECT a.id,a.importance_score,a.impact_score,a.velocity_score,a.sentiment,COALESCE(ms.tier,2) tier FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id WHERE a.id=$1`, [articleId])).rows[0];
  if (!row) return null;
  const result = calculateRisk({ importance: Number(row.importance_score), impact: Number(row.impact_score), velocity: Number(row.velocity_score), sentiment: row.sentiment, tier: Number(row.tier) });
  await pool.query(`UPDATE articles SET risk_score=$2,risk_level=$3 WHERE id=$1`, [articleId, result.score, result.level]);
  if (result.alertType) {
    await pool.query(`INSERT INTO article_alerts(article_id,alert_type,severity,reason,status) VALUES($1,$2,$3,$4,'open') ON CONFLICT(article_id,alert_type) DO UPDATE SET severity=EXCLUDED.severity,reason=EXCLUDED.reason,status='open'`, [articleId, result.alertType, result.level, result.reasons.join(' · ')]);
  } else {
    await pool.query(`UPDATE article_alerts SET status='resolved' WHERE article_id=$1 AND status <> 'resolved'`, [articleId]);
  }
  return { ...result, articleId };
}
