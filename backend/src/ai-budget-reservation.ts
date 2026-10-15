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
  if (!/^\d+$/.test(reservationId) || !Number.isFinite(actualUsd) || actualUsd < 0) {
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
  if (!/^\d+$/.test(reservationId)) throw new Error('AI_BUDGET_INVALID_RESERVATION');
  const result = await pool.query(
    `UPDATE ai_budget_reservations SET status='released'
      WHERE id=$1 AND status='reserved' RETURNING id`,
    [reservationId],
  );
  if (!result.rowCount) throw new Error('AI_RESERVATION_NOT_PENDING');
}

export async function getAiModelPrice(pool: Pool, modelId: number): Promise<{
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}> {
  if (!Number.isSafeInteger(modelId) || modelId <= 0) throw new Error('AI_MODEL_INVALID');
  const { rows } = await pool.query(
    `SELECT input_usd_per_million, output_usd_per_million
       FROM ai_model_prices WHERE model_id=$1 AND effective_from<=NOW()
       ORDER BY effective_from DESC LIMIT 1`, [modelId],
  );
  if (!rows.length) throw new Error('AI_MODEL_PRICE_NOT_CONFIGURED');
  const inputUsdPerMillion = Number(rows[0].input_usd_per_million);
  const outputUsdPerMillion = Number(rows[0].output_usd_per_million);
  if (![inputUsdPerMillion, outputUsdPerMillion].every(v => Number.isFinite(v) && v >= 0)) {
    throw new Error('AI_MODEL_PRICE_INVALID');
  }
  return { inputUsdPerMillion, outputUsdPerMillion };
}

export function calculateAiTokenCost(
  inputTokens: number,
  outputTokens: number,
  price: { inputUsdPerMillion: number; outputUsdPerMillion: number },
): number {
  if (![inputTokens, outputTokens].every(v => Number.isSafeInteger(v) && v >= 0) ||
      ![price.inputUsdPerMillion, price.outputUsdPerMillion].every(v => Number.isFinite(v) && v >= 0)) {
    throw new Error('AI_TOKEN_USAGE_INVALID');
  }
  const cost = (inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion) / 1_000_000;
  if (!Number.isFinite(cost)) throw new Error('AI_TOKEN_COST_INVALID');
  // Database ledger has six decimal places; round up to avoid understating spend.
  return Math.ceil(cost * 1_000_000 - 1e-9) / 1_000_000;
}

export async function settleAiBudgetWithUsage(pool: Pool, input: {
  reservationId: string;
  userId: number;
  modelId: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
}): Promise<{ actualUsd: number }> {
  if (!/^\d+$/.test(input.reservationId) ||
      !Number.isSafeInteger(input.userId) || input.userId <= 0 ||
      !Number.isSafeInteger(input.modelId) || input.modelId <= 0 ||
      ![input.inputTokens, input.outputTokens].every(v => Number.isSafeInteger(v) && v >= 0) ||
      (input.latencyMs !== undefined && (!Number.isSafeInteger(input.latencyMs) || input.latencyMs < 0))) {
    throw new Error('AI_USAGE_INVALID');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reservation = await client.query(
      `SELECT r.task_id, r.status, b.provider_id
         FROM ai_budget_reservations r
         JOIN ai_provider_budgets b ON b.id=r.budget_id
        WHERE r.id=$1`, [input.reservationId],
    );
    if (!reservation.rowCount || reservation.rows[0].status !== 'reserved') {
      throw new Error('AI_RESERVATION_NOT_PENDING');
    }
    const providerId = reservation.rows[0].provider_id;
    await client.query('SELECT id FROM ai_providers WHERE id=$1 FOR UPDATE', [providerId]);
    const priceRows = await client.query(
      `SELECT pr.input_usd_per_million, pr.output_usd_per_million
         FROM ai_model_prices pr JOIN ai_models m ON m.id=pr.model_id
        WHERE pr.model_id=$1 AND m.provider_id=$2 AND pr.effective_from<=NOW()
        ORDER BY pr.effective_from DESC LIMIT 1`, [input.modelId, providerId],
    );
    if (!priceRows.rowCount) throw new Error('AI_MODEL_PRICE_NOT_CONFIGURED');
    const actualUsd = calculateAiTokenCost(input.inputTokens, input.outputTokens, {
      inputUsdPerMillion: Number(priceRows.rows[0].input_usd_per_million),
      outputUsdPerMillion: Number(priceRows.rows[0].output_usd_per_million),
    });
    const updated = await client.query(
      `UPDATE ai_budget_reservations SET status='settled', settled_usd=$2
        WHERE id=$1 AND status='reserved' RETURNING id`, [input.reservationId, actualUsd],
    );
    if (!updated.rowCount) throw new Error('AI_RESERVATION_NOT_PENDING');
    await client.query(
      `INSERT INTO ai_usage_logs(task_id,provider_id,model_id,user_id,status,latency_ms,input_tokens,output_tokens)
       VALUES($1,$2,$3,$4,'success',$5,$6,$7)`,
      [reservation.rows[0].task_id, providerId, input.modelId, input.userId,
       input.latencyMs ?? null, input.inputTokens, input.outputTokens],
    );
    await client.query('COMMIT');
    return { actualUsd };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
