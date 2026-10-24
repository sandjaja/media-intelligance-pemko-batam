import type { Pool } from 'pg';

// Read-only review of unresolved reservations. Never auto-release after a timeout.
export async function listPendingAiReservations(pool: Pool, minAgeMinutes = 30, limit = 100) {
  if (!Number.isSafeInteger(minAgeMinutes) || minAgeMinutes < 0 || minAgeMinutes > 43200 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('AI_RECONCILIATION_INVALID_FILTER');
  }
  const { rows } = await pool.query(
    `SELECT r.id AS reservation_id, r.request_key, r.created_at,
            r.reserved_usd, r.task_id, t.code AS task_code,
            b.provider_id, p.code AS provider_code,
            EXTRACT(EPOCH FROM (NOW()-r.created_at))/60 AS age_minutes
       FROM ai_budget_reservations r
       JOIN ai_provider_budgets b ON b.id=r.budget_id
       JOIN ai_providers p ON p.id=b.provider_id
       LEFT JOIN ai_tasks t ON t.id=r.task_id
      WHERE r.status='reserved'
        AND r.created_at <= NOW()-($1::integer * INTERVAL '1 minute')
      ORDER BY r.created_at ASC, r.id ASC LIMIT $2`,
    [minAgeMinutes, limit],
  );
  return rows;
}
