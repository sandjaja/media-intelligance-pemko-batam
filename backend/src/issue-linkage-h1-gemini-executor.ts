import type { Pool } from 'pg';
import { prepareGeminiRequest } from './ai-gemini-config.js';
import { invokeAiProvider } from './ai-provider-adapters.js';
import {
  buildH1GeminiGroupPrompt,
  validateH1GeminiGroupResult,
  type H1EvidenceRef,
} from './issue-linkage-h1-batch-lock.js';

export type H1GeminiGroup = {
  primaryKeyword: string;
  opdId: number | null;
  evidence: Array<H1EvidenceRef & { opdId?: number | null; title?: string | null; summary?: string | null }>;
};

/**
 * Provider phase only. Caller MUST atomically claim the batch and reserve every
 * evidence ref before calling this function. Never retry ambiguous provider errors.
 * This function does not update issue status or persist any result.
 */
export async function analyzeReservedH1Groups(
  pool: Pool,
  groups: H1GeminiGroup[],
  onValidatedGroup: (result: {
    groupIndex: number;
    primaryKeyword: string;
    opdId: number | null;
    analysis: ReturnType<typeof validateH1GeminiGroupResult>;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    latencyMs: number;
  }) => Promise<void>,
): Promise<Array<{
  primaryKeyword: string;
  opdId: number | null;
  analysis: ReturnType<typeof validateH1GeminiGroupResult>;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}>> {
  if (typeof onValidatedGroup !== 'function') throw new Error('H1_RESULT_PERSISTENCE_REQUIRED');
  if (groups.length < 1 || groups.length > 5) throw new Error('H1_INVALID_GROUP_COUNT');
  // Validate all groups before reserving even one Gemini request.
  const prompts = groups.map(buildH1GeminiGroupPrompt);
  const seen = new Set<string>();
  for (const group of groups) {
    for (const evidence of group.evidence) {
      const ref = `${evidence.sourceType}:${evidence.id}`;
      if (seen.has(ref)) throw new Error('H1_DUPLICATE_EVIDENCE_ACROSS_GROUPS');
      seen.add(ref);
    }
  }
  const results = [];
  for (let i = 0; i < groups.length; i++) {
    // Atomic daily quota reservation, database-configured Gemini model/key.
    const { key, model } = await prepareGeminiRequest(pool, 'issue_linkage_h1');
    const response = await invokeAiProvider({
      provider: 'gemini', model, apiKey: key, prompt: prompts[i], timeoutMs: 60000,
    });
    const analysis = validateH1GeminiGroupResult(groups[i], response.data);
    const validated = {
      primaryKeyword: groups[i].primaryKeyword,
      opdId: groups[i].opdId,
      analysis,
      model,
      usage: response.usage,
      latencyMs: response.latencyMs,
    };
    // Persist each verified response immediately. A later provider failure must not
    // discard earlier successful analysis or trigger automatic replay.
    await onValidatedGroup({ groupIndex: i, ...validated });
    results.push(validated);
  }
  return results;
}

/**
 * Durable, append-only per-group checkpoint. A failed write aborts the batch;
 * the caller must not mark it completed or retry reserved evidence automatically.
 * audit_logs is an existing application table, so no new migration is required.
 */
export async function persistH1GeminiGroupResult(
  pool: Pool,
  input: {
    batchId: number;
    organizationId: number;
    userId: string | number;
    newsDate: string;
    groupIndex: number;
    primaryKeyword: string;
    opdId: number | null;
    evidenceRefs: string[];
    analysis: ReturnType<typeof validateH1GeminiGroupResult>;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    latencyMs: number;
  },
): Promise<void> {
  if (!Number.isSafeInteger(input.batchId) || input.batchId <= 0 ||
      !Number.isSafeInteger(input.organizationId) || input.organizationId <= 0 ||
      !Number.isInteger(input.groupIndex) || input.groupIndex < 0 || input.groupIndex >= 5 ||
      !input.evidenceRefs.length || input.evidenceRefs.length > 40 ||
      new Set(input.evidenceRefs).size !== input.evidenceRefs.length ||
      input.evidenceRefs.some(ref => !/^(online|print|social|owned):[1-9]\\d*$/.test(ref))) {
    throw new Error('H1_INVALID_CHECKPOINT');
  }
  await pool.query(
    `INSERT INTO audit_logs(user_id,action,metadata)
     VALUES($1,'ISSUE_LINKAGE_H1_GEMINI_GROUP_ANALYZED',$2::jsonb)`,
    [input.userId, JSON.stringify({
      batchId: input.batchId, organizationId: input.organizationId,
      newsDate: input.newsDate, groupIndex: input.groupIndex,
      primaryKeyword: input.primaryKeyword, opdId: input.opdId,
      evidenceRefs: input.evidenceRefs, analysis: input.analysis,
      model: input.model, usage: input.usage, latencyMs: input.latencyMs,
    })],
  );
}
