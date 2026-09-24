import { Pool } from 'pg';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

export function calculateRisk(input: { importance: number; impact: number; velocity: number; sentiment: string | null; sentimentScore?: number | null }): { score: number; level: RiskLevel; reasons: string[]; alertType: string | null } {
  const importance = clamp(Number(input.importance));
  const impact = clamp(Number(input.impact));
  const velocity = clamp(Number(input.velocity));
  const rawSentiment = Number(input.sentimentScore);
  const sentimentIntensity = input.sentiment === 'negative'
    ? (Number.isFinite(rawSentiment) && rawSentiment !== 0 ? clamp(Math.abs(rawSentiment)) : 100)
    : 0;

  const sentimentRisk = sentimentIntensity * 0.30;
  const importanceRisk = importance * 0.25;
  const impactRisk = impact * 0.25;
  const velocityRisk = velocity * 0.20;
  const score = Math.min(100, Math.round(sentimentRisk + importanceRisk + impactRisk + velocityRisk));

  const reasons: string[] = [];
  if (sentimentRisk > 0) reasons.push(`Sentimen negatif +${Math.round(sentimentRisk)}`);
  if (importanceRisk > 0) reasons.push(`Importance +${Math.round(importanceRisk)}`);
  if (impactRisk > 0) reasons.push(`Dampak publik +${Math.round(impactRisk)}`);
  if (velocityRisk > 0) reasons.push(`Momentum pemberitaan +${Math.round(velocityRisk)}`);

  const level: RiskLevel = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 35 ? 'medium' : 'low';
  const alertType = level === 'critical' ? 'CRITICAL_MEDIA_RISK' : level === 'high' ? 'HIGH_MEDIA_RISK' : null;
  return { score, level, reasons, alertType };
}

export async function applyRisk(pool: Pool, articleId: string) {
  const row = (await pool.query(`SELECT a.id,a.importance_score,a.impact_score,a.velocity_score,a.sentiment FROM articles a WHERE a.id=$1`, [articleId])).rows[0];
  if (!row) return null;
  const result = calculateRisk({ importance: Number(row.importance_score), impact: Number(row.impact_score), velocity: Number(row.velocity_score), sentiment: row.sentiment });
  await pool.query(`UPDATE articles SET risk_score=$2,risk_level=$3 WHERE id=$1`, [articleId, result.score, result.level]);
  if (result.alertType) {
    await pool.query(`INSERT INTO article_alerts(article_id,alert_type,severity,reason,status) VALUES($1,$2,$3,$4,'open') ON CONFLICT(article_id,alert_type) DO UPDATE SET severity=EXCLUDED.severity,reason=EXCLUDED.reason,status='open'`, [articleId, result.alertType, result.level, result.reasons.join(' · ')]);
  } else {
    await pool.query(`UPDATE article_alerts SET status='resolved' WHERE article_id=$1 AND status <> 'resolved'`, [articleId]);
  }
  return { ...result, articleId };
}
