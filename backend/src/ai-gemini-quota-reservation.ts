import type { Pool } from 'pg';

/** Reserve one Gemini request atomically before making an external request.
 * Missing or disabled quota configuration fails closed; no API request is sent.
 * Reservations are not refunded on ambiguous provider errors.
 */
export async function reserveGeminiDailyRequest(pool: Pick<Pool, 'query'>, modelCode: string, featureCode = 'unattributed'): Promise<void> {
  const result = await pool.query(
    `INSERT INTO ai_free_tier_daily_usage(model_id,usage_date,reserved_requests)
       SELECT l.model_id,(now() AT TIME ZONE 'UTC')::date,1
       FROM ai_free_tier_daily_limits l
       JOIN ai_models m ON m.id=l.model_id
       JOIN ai_providers p ON p.id=m.provider_id
       WHERE m.code=$1 AND p.code='gemini' AND m.enabled=TRUE AND p.enabled=TRUE
         AND l.enabled=TRUE AND l.max_requests>0
       ON CONFLICT(model_id,usage_date) DO UPDATE
       SET reserved_requests=ai_free_tier_daily_usage.reserved_requests+1,updated_at=now()
       WHERE ai_free_tier_daily_usage.reserved_requests <
         (SELECT max_requests FROM ai_free_tier_daily_limits WHERE model_id=EXCLUDED.model_id AND enabled=TRUE)
       RETURNING model_id`,
    [modelCode],
  );
  if (!result.rows.length) throw new Error('AI_GEMINI_DAILY_QUOTA_EXCEEDED_OR_DISABLED');
  // Audit is best-effort and never changes the authoritative daily reservation.
  // Until the Preview migration is applied, usage remains counted as before.
  try {
    await pool.query(
      `INSERT INTO ai_gemini_quota_feature_audit(model_id,usage_date,feature_code)
       VALUES ($1,(now() AT TIME ZONE 'UTC')::date,$2)`,
      [result.rows[0].model_id, featureCode.slice(0,80)],
    );
  } catch { /* audit migration may not yet be installed */ }
}
