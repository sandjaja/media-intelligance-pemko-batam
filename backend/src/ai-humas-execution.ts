import type { Pool } from 'pg';
import { decryptIntegrationCredential } from './integration-credentials.js';
import { executeConfiguredAi } from './ai-execution-gateway.js';
import { invokeAiProvider, AI_MAX_PROMPT_CHARS, type AiMediaPart, type AiProvider } from './ai-provider-adapters.js';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';

export type HumasAiTask = 'gap_analysis' | 'strakom_analysis' | 'publication_analysis' | 'monitoring_analysis' | 'content_studio_prompting';
export type HumasAiConfig = {
  taskId: number; providerId: number; modelId: number;
  provider: AiProvider; model: string; prompt: string; promptVersion: number;
};

/** Read the exact Humas selection and current prompt. Never substitute a provider/model. */
export async function loadHumasAiTask(pool: Pool, taskCode: HumasAiTask): Promise<HumasAiConfig> {
  const { rows } = await pool.query(`SELECT t.id AS task_id,t.enabled AS task_enabled,
    p.id AS provider_id,p.code AS provider,p.enabled AS provider_enabled,
    m.id AS model_id,m.code AS model,m.enabled AS model_enabled,
    h.prompt_text,h.version AS prompt_version
    FROM ai_humas_model_selections s
    JOIN ai_tasks t ON t.code=s.task_code
    JOIN ai_models m ON m.id=s.model_id
    JOIN ai_providers p ON p.id=m.provider_id
    LEFT JOIN ai_humas_task_prompts h ON h.task_code=s.task_code
    WHERE s.task_code=$1 LIMIT 1`, [taskCode]);
  const row = rows[0];
  if (!row) throw new Error('AI_HUMAS_MODEL_SELECTION_MISSING');
  if (!row.task_enabled || !row.provider_enabled || !row.model_enabled) throw new Error('AI_HUMAS_SELECTED_MODEL_DISABLED');
  if (!['gemini', 'openai', 'anthropic'].includes(row.provider)) throw new Error('AI_HUMAS_SELECTED_PROVIDER_UNSUPPORTED');
  if (typeof row.prompt_text !== 'string' || !row.prompt_text.trim()) throw new Error('AI_HUMAS_PROMPT_NOT_CONFIGURED');
  return { taskId: Number(row.task_id), providerId: Number(row.provider_id), modelId: Number(row.model_id),
    provider: row.provider, model: row.model, prompt: row.prompt_text.trim(), promptVersion: Number(row.prompt_version) };
}

export async function executeHumasAi(pool: Pool, input: {
  userId: number; taskCode: HumasAiTask | 'evaluation_analysis'; config: HumasAiConfig;
  prompt: string; mediaParts?: AiMediaPart[];
}): Promise<any> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) throw new Error('AI_GATEWAY_INVALID_CONTEXT');
  if (!input.prompt || input.prompt.length > AI_MAX_PROMPT_CHARS) throw new Error('AI_HUMAS_PROMPT_TOO_LARGE');
  const config = input.config;
  if (config.provider !== 'gemini') {
    return (await executeConfiguredAi(pool, { userId: input.userId, taskCode: input.taskCode,
      provider: config.provider, modelCode: config.model, prompt: input.prompt, mediaParts: input.mediaParts })).data;
  }
  let taskId=config.taskId;
  if(input.taskCode==='evaluation_analysis'){
    const task=await pool.query('SELECT id FROM ai_tasks WHERE code=$1 AND enabled=TRUE',[input.taskCode]);
    if(!task.rows.length)throw Error('AI_EVALUATION_TASK_NOT_CONFIGURED');
    taskId=Number(task.rows[0].id);
  }
  const credentials = await pool.query('SELECT credential_ciphertext FROM ai_provider_credentials WHERE provider_id=$1', [config.providerId]);
  if (!credentials.rows[0]) throw new Error('AI_GATEWAY_CREDENTIAL_NOT_CONFIGURED');
  const apiKey = decryptIntegrationCredential(credentials.rows[0].credential_ciphertext);
  if (!apiKey) throw new Error('AI_GATEWAY_CREDENTIAL_UNAVAILABLE');
  await reserveGeminiDailyRequest(pool, config.model, input.taskCode);
  let result;
  const startedAt=Date.now();
  try {
    result=await invokeAiProvider({ provider: 'gemini', model: config.model, apiKey, prompt: input.prompt, mediaParts: input.mediaParts });
  } catch (error) {
    const code=error instanceof Error&&/^AI_[A-Z0-9_]+$/.test(error.message)?error.message:'AI_PROVIDER_REQUEST_FAILED';
    try {
      await pool.query(`INSERT INTO ai_usage_logs(task_id,provider_id,model_id,user_id,status,latency_ms,error_code)
        VALUES($1,$2,$3,$4,'failed',$5,$6)`,[taskId,config.providerId,config.modelId,input.userId,Date.now()-startedAt,code]);
    } catch { /* keep the original provider failure; quota remains reserved */ }
    throw error;
  }
  const logged = await pool.query(`INSERT INTO ai_usage_logs(task_id,provider_id,model_id,user_id,status,latency_ms,input_tokens,output_tokens)
    VALUES($1,$2,$3,$4,'success',$5,$6,$7) RETURNING id`,
    [taskId,config.providerId,config.modelId,input.userId,result.latencyMs,result.usage.inputTokens,result.usage.outputTokens]);
  if (!logged.rowCount) throw new Error('AI_USAGE_LOG_FAILED');
  return result.data;
}
