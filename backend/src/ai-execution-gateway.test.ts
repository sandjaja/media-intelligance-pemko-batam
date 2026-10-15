import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { executeBudgetedAi } from './ai-execution-gateway.js';

function gatewayPool(options: { route?: boolean; budget?: boolean; providerError?: boolean; logError?: boolean } = {}) {
  const statements: string[] = [];
  let invoked = 0;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push(sql);
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
    if (sql.includes('SELECT m.id FROM ai_models')) {
      return options.route === false ? { rows: [], rowCount: 0 } : { rows: [{ id: 4 }], rowCount: 1 };
    }
    if (sql.includes('SELECT id FROM ai_providers WHERE')) return { rows: [{ id: 2 }], rowCount: 1 };
    if (sql.includes('FROM ai_provider_budgets')) {
      return options.budget === false ? { rows: [], rowCount: 0 } : { rows: [{ id: 5, limit_usd: 1 }], rowCount: 1 };
    }
    if (sql.includes('SUM(CASE')) return { rows: [{ usd: 0 }], rowCount: 1 };
    if (sql.includes('INSERT INTO ai_budget_reservations')) return { rows: [{ id: 7 }], rowCount: 1 };
    if (sql.includes('FROM ai_budget_reservations r')) return { rows: [{ task_id: 3, status: 'reserved', provider_id: 2 }], rowCount: 1 };
    if (sql.includes('FROM ai_model_prices pr')) return { rows: [{ input_usd_per_million: 1, output_usd_per_million: 2 }], rowCount: 1 };
    if (sql.includes('UPDATE ai_budget_reservations')) return { rows: [{ id: 7 }], rowCount: 1 };
    if (sql.includes('INSERT INTO ai_usage_logs')) {
      assert.deepEqual(params, [3, 2, 4, 99, 10, 100, 50]);
      if (options.logError) throw new Error('MOCK_USAGE_LOG_FAILED');
      return { rows: [], rowCount: 1 };
    }
    throw new Error('MOCK_UNEXPECTED_SQL');
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const invoke = async () => {
    invoked++;
    if (options.providerError) throw new Error('MOCK_PROVIDER_TIMEOUT');
    return { data: { ok: true }, usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 10 };
  };
  return { pool, invoke, statements, calls: () => invoked };
}

const base = { userId: 99, taskId: 3, providerId: 2, modelId: 4, estimatedUsd: 0.5 };

test('gateway reserves before invoking and logs token usage on success', async () => {
  const db = gatewayPool();
  const result = await executeBudgetedAi(db.pool, { ...base, invoke: db.invoke });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.actualUsd, 0.0002);
  const reserve = db.statements.findIndex(s => s.includes('INSERT INTO ai_budget_reservations'));
  const settle = db.statements.findIndex(s => s.includes('INSERT INTO ai_usage_logs'));
  assert.ok(reserve >= 0 && settle > reserve);
  assert.equal(db.calls(), 1);
});

test('gateway does not call provider for an unconfigured route', async () => {
  const db = gatewayPool({ route: false });
  await assert.rejects(executeBudgetedAi(db.pool, { ...base, invoke: db.invoke }), /AI_GATEWAY_ROUTE_NOT_CONFIGURED/);
  assert.equal(db.calls(), 0);
});

test('gateway does not call provider without a configured budget', async () => {
  const db = gatewayPool({ budget: false });
  await assert.rejects(executeBudgetedAi(db.pool, { ...base, invoke: db.invoke }), /AI_BUDGET_NOT_CONFIGURED/);
  assert.equal(db.calls(), 0);
});

test('ambiguous provider error leaves reservation pending for reconciliation', async () => {
  const db = gatewayPool({ providerError: true });
  await assert.rejects(executeBudgetedAi(db.pool, { ...base, invoke: db.invoke }), /MOCK_PROVIDER_TIMEOUT/);
  assert.equal(db.calls(), 1);
  assert.equal(db.statements.some(s => s.includes('UPDATE ai_budget_reservations')), false);
});

test('usage log failure rolls back settlement instead of reporting success', async () => {
  const db = gatewayPool({ logError: true });
  await assert.rejects(executeBudgetedAi(db.pool, { ...base, invoke: db.invoke }), /MOCK_USAGE_LOG_FAILED/);
  assert.ok(db.statements.includes('ROLLBACK'));
  assert.equal(db.statements.includes('COMMIT'), true); // reservation committed; settlement rolled back
});
