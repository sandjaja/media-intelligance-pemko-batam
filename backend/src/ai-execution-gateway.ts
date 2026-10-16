import type { Pool } from 'pg';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';
import { randomUUID } from 'node:crypto';
import { reserveAiBudget, settleAiBudgetWithUsage, getAiModelPrice, calculateAiTokenCost } from './ai-budget-reservation.js';
import { invokeAiProvider, AI_GATEWAY_MAX_OUTPUT_TOKENS, type AiProvider, type AiMediaPart, AI_MAX_PROMPT_CHARS, countAiInputTokens } from './ai-provider-adapters.js';
import { decryptIntegrationCredential } from './integration-credentials.js';

export type AiGatewayUsage = { inputTokens: number; outputTokens: number };
export type AiGatewayResult<T> = { data: T; usage: AiGatewayUsage; actualUsd: number };

// Caller supplies an authenticated user, selected DB model/task, and a provider
// adapter. This helper does not invoke any provider until the budget reservation
// commits. A failed/ambiguous provider response intentionally retains the
// reservation for reconciliation; automatic release could undercount spend.
export async function executeBudgetedAi<T>(pool: Pool, input: {
  userId: number;
  taskId: number;
  providerId: number;
  modelId: number;
  estimatedUsd: number;
  invoke: () => Promise<{ data: T; usage: AiGatewayUsage; latencyMs?: number }>;
}): Promise<AiGatewayResult<T>> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0 ||
      !Number.isSafeInteger(input.taskId) || input.taskId <= 0 ||
      !Number.isSafeInteger(input.providerId) || input.providerId <= 0 ||
      !Number.isSafeInteger(input.modelId) || input.modelId <= 0 ||
      !Number.isFinite(input.estimatedUsd) || input.estimatedUsd <= 0) {
    throw new Error('AI_GATEWAY_INVALID_CONTEXT');
  }
  // An enabled infrastructure route or the exact saved Humas selection authorizes the model.
  // Both paths still pass the same budget reservation and token settlement.
  const { rows } = await pool.query(
    `SELECT m.id FROM ai_models m
       JOIN ai_providers p ON p.id=m.provider_id
       JOIN ai_tasks t ON t.id=$3
      WHERE m.id=$1 AND p.id=$2
        AND m.enabled=TRUE AND p.enabled=TRUE AND t.enabled=TRUE
        AND (
          EXISTS(SELECT 1 FROM ai_task_routes r WHERE r.task_id=t.id AND r.provider_id=p.id AND r.model_id=m.id AND r.enabled=TRUE)
          OR EXISTS(SELECT 1 FROM ai_humas_model_selections s WHERE s.task_code=CASE WHEN t.code='evaluation_analysis' THEN 'monitoring_analysis' ELSE t.code END AND s.model_id=m.id
            AND t.code IN ('gap_analysis','strakom_analysis','publication_analysis','monitoring_analysis','content_studio_prompting','evaluation_analysis'))
        )
      LIMIT 1`,
    [input.modelId, input.providerId, input.taskId],
  );
  if (!rows.length) throw new Error('AI_GATEWAY_ROUTE_NOT_CONFIGURED');
  const reservation = await reserveAiBudget(pool, {
    providerId: input.providerId,
    taskId: input.taskId,
    requestKey: randomUUID(),
    estimatedUsd: input.estimatedUsd,
  });
  const result = await input.invoke();
  const { actualUsd } = await settleAiBudgetWithUsage(pool, {
    reservationId: reservation.reservationId,
    userId: input.userId,
    modelId: input.modelId,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: result.latencyMs,
  });
  return { data: result.data, usage: result.usage, actualUsd };
}

export async function executeConfiguredAi(pool: Pool, input: {
  userId: number;
  taskCode: string;
  provider: AiProvider;
  modelCode: string;
  prompt: string;
  mediaParts?: AiMediaPart[];
}): Promise<AiGatewayResult<unknown>> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0 || !input.taskCode || !input.modelCode || !input.prompt || input.prompt.length > AI_MAX_PROMPT_CHARS) {
    throw new Error('AI_GATEWAY_INVALID_REQUEST');
  }
  const { rows } = await pool.query(
    `SELECT t.id AS task_id,p.id AS provider_id,m.id AS model_id
       FROM ai_models m
       JOIN ai_providers p ON p.id=m.provider_id
       JOIN ai_tasks t ON t.code=$1
      WHERE p.code=$2 AND m.code=$3
        AND t.enabled=TRUE AND p.enabled=TRUE AND m.enabled=TRUE
        AND (
          EXISTS(SELECT 1 FROM ai_task_routes r WHERE r.task_id=t.id AND r.provider_id=p.id AND r.model_id=m.id AND r.enabled=TRUE)
          OR EXISTS(SELECT 1 FROM ai_humas_model_selections s WHERE s.task_code=CASE WHEN t.code='evaluation_analysis' THEN 'monitoring_analysis' ELSE t.code END AND s.model_id=m.id
            AND t.code IN ('gap_analysis','strakom_analysis','publication_analysis','monitoring_analysis','content_studio_prompting','evaluation_analysis'))
        )
      LIMIT 1`,
    [input.taskCode, input.provider, input.modelCode],
  );
  if (!rows.length) throw new Error('AI_GATEWAY_ROUTE_NOT_CONFIGURED');
  const route = rows[0];
  // Credentials never come from Humas requests. Read encrypted server-side
  // configuration and fail closed if the provider key cannot be decrypted.
  const credential = await pool.query(
    'SELECT credential_ciphertext FROM ai_provider_credentials WHERE provider_id=$1',
    [route.provider_id],
  );
  if (!credential.rowCount) throw new Error('AI_GATEWAY_CREDENTIAL_NOT_CONFIGURED');
  let apiKey: string;
  try {
    apiKey = decryptIntegrationCredential(credential.rows[0].credential_ciphertext);
  } catch {
    throw new Error('AI_GATEWAY_CREDENTIAL_UNAVAILABLE');
  }
  if (!apiKey) throw new Error('AI_GATEWAY_CREDENTIAL_UNAVAILABLE');
  const price = await getAiModelPrice(pool, Number(route.model_id));
  // Estimate the upper bound using UTF-8 bytes (not JavaScript UTF-16 code units).
  // This avoids under-reserving for Indonesian text mixed with emoji or other multibyte characters.
  const estimatedInputTokens = input.mediaParts?.length
    ? Math.max(2048, Math.ceil(await countAiInputTokens(inputWithKey()) * 1.1) + 1024)
    : Math.max(2048, Buffer.byteLength(input.prompt, 'utf8') * 2);
  function inputWithKey() { return { ...input, model: input.modelCode, apiKey }; }
  if (!Number.isSafeInteger(estimatedInputTokens)) throw new Error('AI_GATEWAY_ESTIMATE_INVALID');
  const estimatedUsd = calculateAiTokenCost(estimatedInputTokens, AI_GATEWAY_MAX_OUTPUT_TOKENS, price);
  if (estimatedUsd <= 0) throw new Error('AI_GATEWAY_ZERO_COST_REQUIRES_FREE_TIER_POLICY');
  return executeBudgetedAi(pool, {
    userId: input.userId,
    taskId: Number(route.task_id),
    providerId: Number(route.provider_id),
    modelId: Number(route.model_id),
    estimatedUsd,
    invoke: async () => {
      // Even budgeted Gemini routes consume the same per-model daily quota.
      // Reserve immediately before the outbound provider call, never for OpenAI/Claude.
      if (input.provider === 'gemini') await reserveGeminiDailyRequest(pool, input.modelCode, 'ai_gateway');
      return invokeAiProvider({
        provider: input.provider,
        model: input.modelCode,
        apiKey,
        prompt: input.prompt,
        mediaParts: input.mediaParts,
      });
    },
  });
}
