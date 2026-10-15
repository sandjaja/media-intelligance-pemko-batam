import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { invokeAiProvider, AI_GATEWAY_MAX_OUTPUT_TOKENS } from './ai-provider-adapters.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function mockResponse(payload: unknown) {
  let request: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = async (url, init) => {
    request = { url: String(url), init };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return () => {
    assert.ok(request);
    return request;
  };
}

test('Gemini normalizes JSON and token usage without network', async () => {
  const request = mockResponse({
    candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
  });
  const result = await invokeAiProvider({ provider: 'gemini', model: 'test-model', apiKey: 'mock', prompt: 'hello' });
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 7 });
  assert.equal(JSON.parse(String(request().init?.body)).generationConfig.maxOutputTokens, AI_GATEWAY_MAX_OUTPUT_TOKENS);
});

test('OpenAI normalizes JSON and token usage without network', async () => {
  const request = mockResponse({
    output: [{ content: [{ type: 'output_text', text: '{"result":"ok"}' }] }],
    usage: { input_tokens: 25, output_tokens: 9 },
  });
  const result = await invokeAiProvider({ provider: 'openai', model: 'test-model', apiKey: 'mock', prompt: 'hello' });
  assert.deepEqual(result.data, { result: 'ok' });
  assert.deepEqual(result.usage, { inputTokens: 25, outputTokens: 9 });
  assert.equal(JSON.parse(String(request().init?.body)).max_output_tokens, AI_GATEWAY_MAX_OUTPUT_TOKENS);
});

test('Claude normalizes JSON and token usage without network', async () => {
  const request = mockResponse({
    content: [{ type: 'text', text: '{"items":[]}' }],
    usage: { input_tokens: 30, output_tokens: 11 },
  });
  const result = await invokeAiProvider({ provider: 'anthropic', model: 'test-model', apiKey: 'mock', prompt: 'hello' });
  assert.deepEqual(result.data, { items: [] });
  assert.deepEqual(result.usage, { inputTokens: 30, outputTokens: 11 });
  assert.equal(JSON.parse(String(request().init?.body)).max_tokens, AI_GATEWAY_MAX_OUTPUT_TOKENS);
});

test('Missing usage fails closed instead of logging zero', async () => {
  mockResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  await assert.rejects(
    invokeAiProvider({ provider: 'gemini', model: 'test-model', apiKey: 'mock', prompt: 'hello' }),
    /AI_PROVIDER_USAGE_MISSING/,
  );
});

test('Invalid JSON is rejected', async () => {
  mockResponse({ content: [{ type: 'text', text: 'not json' }], usage: { input_tokens: 3, output_tokens: 4 } });
  await assert.rejects(
    invokeAiProvider({ provider: 'anthropic', model: 'test-model', apiKey: 'mock', prompt: 'hello' }),
    /AI_PROVIDER_INVALID_JSON/,
  );
});

test('Gemini thinking tokens count toward billable output usage', async () => {
  mockResponse({
    candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7, thoughtsTokenCount: 15 },
  });
  const result = await invokeAiProvider({ provider: 'gemini', model: 'test-model', apiKey: 'mock', prompt: 'hello' });
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 22 });
});
