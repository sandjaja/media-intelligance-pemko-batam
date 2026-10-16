import type { Pool } from 'pg';

/** Best-effort Gemini outcome audit; never changes the reserved daily quota. */
export async function recordGeminiExecution(pool: Pick<Pool,'query'>, input: {
  model: string; feature: string; status: 'success'|'failed';
  startedAt: number; payload?: any; error?: string;
}): Promise<void> {
  const inputTokens = input.payload?.usageMetadata?.promptTokenCount;
  const outputTokens = input.payload?.usageMetadata?.candidatesTokenCount;
  const valid = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
  try {
    await pool.query(
      `INSERT INTO ai_usage_logs (task_id,provider_id,model_id,status,latency_ms,input_tokens,output_tokens,error_code)
       SELECT (SELECT id FROM ai_tasks WHERE code=$2 LIMIT 1),p.id,m.id,$3,$4,$5,$6,$7
       FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id
       WHERE p.code='gemini' AND m.code=$1 LIMIT 1`,
      [input.model,input.feature,input.status,Math.max(0,Math.round(Date.now()-input.startedAt)),
       valid(inputTokens),valid(outputTokens),
       input.status==='failed' ? String(input.error||'GEMINI_FAILED').slice(0,180) : null],
    );
  } catch (error) {
    console.warn('[gemini] execution audit unavailable:',String(error).slice(0,100));
  }
}
