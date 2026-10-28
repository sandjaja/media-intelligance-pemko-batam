// Provider adapters return one normalized JSON payload and token accounting.
// API keys are supplied server-side by the caller; never expose them to clients.
export type AiProvider = 'gemini' | 'openai' | 'anthropic';
export const AI_GATEWAY_MAX_OUTPUT_TOKENS = 4096;
export const AI_MAX_PROMPT_CHARS = 120000;
export type AiMediaPart = { inlineData: { mimeType: string; data: string } };

type ProviderInput = { provider: AiProvider; model: string; apiKey: string; prompt: string; mediaParts?: AiMediaPart[] };

function providerRequest(input: ProviderInput): { url: string; headers: Record<string,string>; body: unknown } {
  if (!input.model || !input.apiKey || !input.prompt || input.prompt.length > AI_MAX_PROMPT_CHARS) throw new Error('AI_PROVIDER_INVALID_REQUEST');
  const media = input.mediaParts ?? [];
  if (media.length > 16) throw new Error('AI_PROVIDER_MEDIA_LIMIT');
  let bytes = 0;
  for (const part of media) {
    const { mimeType, data } = part.inlineData ?? {};
    if (!['application/pdf','image/png','image/jpeg','image/webp'].includes(mimeType) ||
        typeof data !== 'string' || !data.length || data.length > 10666668 ||
        (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)))
      throw new Error('AI_PROVIDER_INVALID_MEDIA');
    bytes += Buffer.byteLength(data, 'base64');
  }
  if (bytes > 16_000_000) throw new Error('AI_PROVIDER_MEDIA_LIMIT');
  if (input.provider === 'gemini') return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': input.apiKey },
    body: { contents: [{ parts: [{ text: input.prompt }, ...media] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: AI_GATEWAY_MAX_OUTPUT_TOKENS } },
  };
  if (input.provider === 'openai') return {
    url: 'https://api.openai.com/v1/responses',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
    body: { model: input.model, input: media.length ? [{ role: 'user', content: [
      { type: 'input_text', text: input.prompt },
      ...media.map(({inlineData: m}, i) => m.mimeType === 'application/pdf'
        ? { type: 'input_file', filename: `evidence-${i+1}.pdf`, file_data: `data:${m.mimeType};base64,${m.data}` }
        : { type: 'input_image', image_url: `data:${m.mimeType};base64,${m.data}`, detail: 'auto' }),
    ] }] : input.prompt, max_output_tokens: AI_GATEWAY_MAX_OUTPUT_TOKENS, text: { format: { type: 'json_object' } } },
  };
  if (input.provider === 'anthropic') return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: { 'content-type': 'application/json', 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' },
    body: { model: input.model, max_tokens: AI_GATEWAY_MAX_OUTPUT_TOKENS, messages: [{ role: 'user', content: [
      { type: 'text', text: input.prompt + '\nRespond with valid JSON only.' },
      ...media.map(({inlineData: m}) => ({ type: m.mimeType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: m.mimeType, data: m.data } })),
    ] }] },
  };
  throw new Error('AI_PROVIDER_UNSUPPORTED');
}

/** Count full multimodal input before reserving a paid generation, including PDF page/image tokens. */
export async function countAiInputTokens(input: ProviderInput): Promise<number> {
  const request = providerRequest(input);
  const body = request.body as any;
  if (input.provider === 'gemini') throw new Error('AI_PROVIDER_TOKEN_COUNT_UNSUPPORTED');
  const url = input.provider === 'openai' ? 'https://api.openai.com/v1/responses/input_tokens' : 'https://api.anthropic.com/v1/messages/count_tokens';
  const countBody = input.provider === 'openai'
    ? { model: body.model, input: body.input, text: body.text }
    : { model: body.model, messages: body.messages };
  const response = await fetch(url, { method: 'POST', headers: request.headers, body: JSON.stringify(countBody), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`AI_PROVIDER_TOKEN_COUNT_HTTP_${response.status}`);
  const payload = await response.json() as any;
  const count = tokenCount(payload.input_tokens);
  if (count <= 0) throw new Error('AI_PROVIDER_USAGE_MISSING');
  return count;
}
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
  mediaParts?: AiMediaPart[];
}): Promise<AiProviderResponse> {
  const timeoutMs = input.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('AI_PROVIDER_INVALID_TIMEOUT');
  const { url, headers, body } = providerRequest(input);
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
    const finishReason = payload.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') throw new Error('AI_PROVIDER_OUTPUT_TRUNCATED');
    if (finishReason && finishReason !== 'STOP') throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
    if (payload.promptFeedback?.blockReason) throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
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
    if (payload.status && payload.status !== 'completed') throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
    if (payload.output?.some((item: any) => (item.content ?? []).some((part: any) => part.type === 'refusal'))) throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
    raw = payload.output?.flatMap((item: any) => item.content ?? [])
      .filter((part: any) => part.type === 'output_text')
      .map((part: any) => part.text ?? '').join('');
    inputTokens = payload.usage?.input_tokens;
    outputTokens = payload.usage?.output_tokens;
  } else {
    if (payload.stop_reason === 'max_tokens') throw new Error('AI_PROVIDER_OUTPUT_TRUNCATED');
    if (payload.stop_reason === 'refusal') throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
    if (payload.stop_reason && payload.stop_reason !== 'end_turn' && payload.stop_reason !== 'stop_sequence') throw new Error('AI_PROVIDER_OUTPUT_BLOCKED');
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
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('AI_PROVIDER_INVALID_JSON_SHAPE');
  return { data, usage, latencyMs: Date.now() - started };
}
