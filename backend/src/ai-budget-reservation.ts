import type { Pool } from 'pg';

// Fail-closed budget reservation for future provider execution. Never call a
// paid model unless this function commits a reservation successfully.
export async function reserveAiBudget(pool: Pool, input: {
  providerId: number;
  taskId: number;
  requestKey: string;
  estimatedUsd: number;
}): Promise<{ reservationId: string; budgetId: string }> {
  if (!Number.isSafeInteger(input.providerId) || input.providerId <= 0 ||
      !Number.isSafeInteger(input.taskId) || input.taskId <= 0 ||
      !input.requestKey || input.requestKey.length > 200 ||
      !Number.isFinite(input.estimatedUsd) || input.estimatedUsd <= 0) {
    throw new Error('AI_BUDGET_INVALID_REQUEST');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize competing reservations for a provider to prevent overspend.
    const provider = await client.query('SELECT id FROM ai_providers WHERE id=$1 FOR UPDATE', [input.providerId]);
    if (!provider.rowCount) throw new Error('AI_PROVIDER_NOT_FOUND');
    const budgets = await client.query(
      `SELECT id, limit_usd FROM ai_provider_budgets
        WHERE provider_id=$1 AND enabled=TRUE
          AND CURRENT_DATE>=period_start AND CURRENT_DATE<period_end
        ORDER BY period_start DESC LIMIT 2`, [input.providerId]);
    if (budgets.rows.length !== 1) throw new Error('AI_BUDGET_NOT_CONFIGURED');
    const budget = budgets.rows[0];
    const spent = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN status='settled' THEN settled_usd
                                  WHEN status='reserved' THEN reserved_usd ELSE 0 END),0) AS usd
         FROM ai_budget_reservations WHERE budget_id=$1`, [budget.id]);
    const remaining = Number(budget.limit_usd) - Number(spent.rows[0].usd);
    if (!Number.isFinite(remaining) || remaining < input.estimatedUsd) throw new Error('AI_BUDGET_EXCEEDED');
    const inserted = await client.query(
      `INSERT INTO ai_budget_reservations(budget_id,task_id,request_key,reserved_usd,status)
       VALUES($1,$2,$3,$4,'reserved') RETURNING id`,
      [budget.id,input.taskId,input.requestKey,input.estimatedUsd]);
    await client.query('COMMIT');
    return { reservationId: String(inserted.rows[0].id), budgetId: String(budget.id) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Finalize only after a provider response supplies actual usage and the price
// calculation is available. Never silently cap actual charges at the estimate.
export async function settleAiBudget(pool: Pool, reservationId: string, actualUsd: number): Promise<void> {
  if (!/^\\d+$/.test(reservationId) || !Number.isFinite(actualUsd) || actualUsd < 0) {
    throw new Error('AI_BUDGET_INVALID_SETTLEMENT');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lookup = await client.query(
      'SELECT b.provider_id FROM ai_budget_reservations r JOIN ai_provider_budgets b ON b.id=r.budget_id WHERE r.id=$1',
      [reservationId],
    );
    if (!lookup.rowCount) throw new Error('AI_RESERVATION_NOT_FOUND');
    await client.query('SELECT id FROM ai_providers WHERE id=$1 FOR UPDATE', [lookup.rows[0].provider_id]);
    const updated = await client.query(
      `UPDATE ai_budget_reservations SET status='settled', settled_usd=$2
        WHERE id=$1 AND status='reserved' RETURNING id`,
      [reservationId, actualUsd],
    );
    if (!updated.rowCount) throw new Error('AI_RESERVATION_NOT_PENDING');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Release only when the provider did not execute the request. A timeout or
// unknown response must be reconciled, not assumed to have cost zero.
export async function releaseAiBudget(pool: Pool, reservationId: string): Promise<void> {
  if (!/^\\d+$/.test(reservationId)) throw new Error('AI_BUDGET_INVALID_RESERVATION');
  const result = await pool.query(
    `UPDATE ai_budget_reservations SET status='released'
      WHERE id=$1 AND status='reserved' RETURNING id`,
    [reservationId],
  );
  if (!result.rowCount) throw new Error('AI_RESERVATION_NOT_PENDING');
}
