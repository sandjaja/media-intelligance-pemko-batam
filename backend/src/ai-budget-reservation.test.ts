import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { calculateAiTokenCost, reserveAiBudget, settleAiBudgetWithUsage } from './ai-budget-reservation.js';

function fakePool(options: { limit: number; spent: number; missingBudget?: boolean; failLog?: boolean }) {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string, params: unknown[] = []) {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM ai_providers WHERE')) return { rows: [{ id: 1 }], rowCount: 1 };
      if (sql.includes('FROM ai_provider_budgets')) {
        return options.missingBudget ? { rows: [], rowCount: 0 } : { rows: [{ id: 10, limit_usd: options.limit }], rowCount: 1 };
      }
      if (sql.includes('SUM(CASE')) return { rows: [{ usd: options.spent }], rowCount: 1 };
      if (sql.includes('INSERT INTO ai_budget_reservations')) return { rows: [{ id: 20 }], rowCount: 1 };
      if (sql.includes('FROM ai_budget_reservations r') && sql.includes('JOIN ai_provider_budgets')) {
        return { rows: [{ task_id: 3, status: 'reserved', provider_id: 1 }], rowCount: 1 };
      }
      if (sql.includes('FROM ai_model_prices pr')) {
        return { rows: [{ input_usd_per_million: 1, output_usd_per_million: 2 }], rowCount: 1 };
      }
      if (sql.includes('UPDATE ai_budget_reservations')) return { rows: [{ id: 20 }], rowCount: 1 };
      if (sql.includes('INSERT INTO ai_usage_logs')) {
        assert.deepEqual(params, [3, 1, 4, 99, 120, 100, 50]);
        if (options.failLog) throw new Error('MOCK_LOG_FAILURE');
        return { rows: [], rowCount: 1 };
      }
      throw new Error('UNEXPECTED_SQL');
    },
    release() { released = true; },
  };
  return { pool: { connect: async () => client } as unknown as Pool, statements, isReleased: () => released };
}

test('token cost rounds upward to ledger precision', () => {
  assert.equal(calculateAiTokenCost(100, 50, { inputUsdPerMillion: 1, outputUsdPerMillion: 2 }), 0.0002);
  assert.equal(calculateAiTokenCost(1, 0, { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0 }), 0.000001);
  assert.throws(() => calculateAiTokenCost(-1, 0, { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }), /AI_TOKEN_USAGE_INVALID/);
});

test('reservation commits only when budget covers estimate', async () => {
  const db = fakePool({ limit: 1, spent: 0.25 });
  const result = await reserveAiBudget(db.pool, { providerId: 1, taskId: 3, requestKey: 'mock-1', estimatedUsd: 0.5 });
  assert.equal(result.reservationId, '20');
  assert.ok(db.statements.includes('COMMIT'));
  assert.equal(db.isReleased(), true);
});

test('reservation rolls back when budget is insufficient', async () => {
  const db = fakePool({ limit: 1, spent: 0.9 });
  await assert.rejects(reserveAiBudget(db.pool, { providerId: 1, taskId: 3, requestKey: 'mock-2', estimatedUsd: 0.5 }), /AI_BUDGET_EXCEEDED/);
  assert.ok(db.statements.includes('ROLLBACK'));
  assert.equal(db.statements.some(s => s.includes('INSERT INTO ai_budget_reservations')), false);
});

test('reservation fails closed without an active budget', async () => {
  const db = fakePool({ limit: 1, spent: 0, missingBudget: true });
  await assert.rejects(reserveAiBudget(db.pool, { providerId: 1, taskId: 3, requestKey: 'mock-3', estimatedUsd: 0.1 }), /AI_BUDGET_NOT_CONFIGURED/);
  assert.ok(db.statements.includes('ROLLBACK'));
});

test('settlement records Humas user and actual token cost atomically', async () => {
  const db = fakePool({ limit: 1, spent: 0 });
  const result = await settleAiBudgetWithUsage(db.pool, { reservationId: '20', userId: 99, modelId: 4, inputTokens: 100, outputTokens: 50, latencyMs: 120 });
  assert.equal(result.actualUsd, 0.0002);
  assert.ok(db.statements.includes('COMMIT'));
  assert.equal(db.isReleased(), true);
});

test('failed usage log rolls back settlement', async () => {
  const db = fakePool({ limit: 1, spent: 0, failLog: true });
  await assert.rejects(settleAiBudgetWithUsage(db.pool, { reservationId: '20', userId: 99, modelId: 4, inputTokens: 100, outputTokens: 50, latencyMs: 120 }), /MOCK_LOG_FAILURE/);
  assert.ok(db.statements.includes('ROLLBACK'));
  assert.equal(db.statements.includes('COMMIT'), false);
});
