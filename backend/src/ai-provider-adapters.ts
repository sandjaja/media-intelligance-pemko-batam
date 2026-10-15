// Provider adapters return one normalized JSON payload and token accounting.
// API keys are supplied server-side by the caller; never expose them to clients.
export type AiProvider = 'gemini' | 'openai' | 'anthropic';
export const AI_GATEWAY_MAX_OUTPUT_TOKENS = 4096;
export type AiProviderResponse = {
  data: unknown;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
};

function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('AI_PROVIDER_USAGE_MISSING');
  }
  return value;
}

export async function invokeAiProvider(input: {
  provider: AiProvider;
  model: string;
  apiKey: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<AiProviderResponse> {
  if (!input.model || !input.apiKey || !input.prompt) throw new Error('AI_PROVIDER_INVALID_REQUEST');
  const timeoutMs = input.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error('AI_PROVIDER_INVALID_TIMEOUT');
  }
  let url: string;
  let headers: Record<string, string>;
  let body: unknown;
  if (input.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`;
    headers = { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey };
    body = { contents: [{ parts: [{ text: input.prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: AI_GATEWAY_MAX_OUTPUT_TOKENS } };
  } else if (input.provider === 'openai') {
    url = 'https://api.openai.com/v1/responses';
    headers = { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` };
    body = { model: input.model, input: input.prompt, max_output_tokens: AI_GATEWAY_MAX_OUTPUT_TOKENS, text: { format: { type: 'json_object' } } };
  } else if (input.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'content-type': 'application/json', 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' };
    body = { model: input.model, max_tokens: AI_GATEWAY_MAX_OUTPUT_TOKENS, messages: [{ role: 'user', content: input.prompt + '\nRespond with valid JSON only.' }] };
  } else {
    throw new Error('AI_PROVIDER_UNSUPPORTED');
  }
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
  const payload = await response.json() as any;
  let raw: string | undefined;
  let inputTokens: unknown;
  let outputTokens: unknown;
  if (input.provider === 'gemini') {
    if (payload.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('AI_PROVIDER_OUTPUT_TRUNCATED');
    raw = payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('');
    inputTokens = payload.usageMetadata?.promptTokenCount;
    // Gemini may bill thinking tokens in addition to visible candidate tokens.
    // Include them in the output ledger instead of silently undercounting.
    const visibleTokens = tokenCount(payload.usageMetadata?.candidatesTokenCount);
    const thinkingTokens = payload.usageMetadata?.thoughtsTokenCount === undefined
      ? 0 : tokenCount(payload.usageMetadata.thoughtsTokenCount);
    outputTokens = visibleTokens + thinkingTokens;
  } else if (input.provider === 'openai') {
    if (payload.status === 'incomplete') throw new Error('AI_PROVIDER_OUTPUT_TRUNCATED');
    raw = payload.output?.flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === 'output_text')
      .map((part: any) => part.text ?? '').join('');
    inputTokens = payload.usage?.input_tokens;
    outputTokens = payload.usage?.output_tokens;
  } else {
    if (payload.stop_reason === 'max_tokens') throw new Error('AI_PROVIDER_OUTPUT_TRUNCATED');
    raw = payload.content?.filter((part: any) => part.type === 'text')
      .map((part: any) => part.text ?? '').join('');
    inputTokens = payload.usage?.input_tokens;
    outputTokens = payload.usage?.output_tokens;
  }
  // Reject missing usage rather than reporting a fabricated zero-token call.
  const usage = { inputTokens: tokenCount(inputTokens), outputTokens: tokenCount(outputTokens) };
  if (!raw) throw new Error('AI_PROVIDER_EMPTY_RESPONSE');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('AI_PROVIDER_INVALID_JSON'); }
  return { data, usage, latencyMs: Date.now() - started };
}
