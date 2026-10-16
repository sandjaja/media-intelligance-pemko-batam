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
): Promise<Array<{
  primaryKeyword: string;
  opdId: number | null;
  analysis: ReturnType<typeof validateH1GeminiGroupResult>;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}>> {
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
    results.push({
      primaryKeyword: groups[i].primaryKeyword,
      opdId: groups[i].opdId,
      analysis,
      model,
      usage: response.usage,
      latencyMs: response.latencyMs,
    });
  }
  return results;
}
