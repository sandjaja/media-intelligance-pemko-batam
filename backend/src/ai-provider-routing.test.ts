import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invokeAiProvider, type AiProvider } from './ai-provider-adapters.js';

test('selected AI provider determines actual outbound API host (no silent Gemini fallback)', async () => {
  const original = globalThis.fetch;
  const visited: string[] = [];
  const cases: Array<{ provider: AiProvider; host: string; payload: unknown }> = [
    { provider: 'openai', host: 'api.openai.com', payload: { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{}' }] }], usage: { input_tokens: 1, output_tokens: 1 } } },
    { provider: 'anthropic', host: 'api.anthropic.com', payload: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } } },
    { provider: 'gemini', host: 'generativelanguage.googleapis.com', payload: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } },
  ];
  try {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      visited.push(url.hostname);
      const entry = cases.find(x => x.host === url.hostname);
      assert.ok(entry, 'unexpected provider endpoint');
      return { ok: true, json: async () => entry.payload } as Response;
    }) as typeof fetch;
    for (const entry of cases) {
      const result = await invokeAiProvider({ provider: entry.provider, model: 'test-model', apiKey: 'mock-only', prompt: 'Return JSON' });
      assert.deepEqual(result.data, {});
    }
    assert.deepEqual(visited, cases.map(x => x.host));
  } finally {
    globalThis.fetch = original;
  }
});
