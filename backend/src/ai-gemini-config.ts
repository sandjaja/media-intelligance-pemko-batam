import type { Pool } from 'pg';
import { decryptIntegrationCredential } from './integration-credentials.js';
import { reserveGeminiDailyRequest } from './ai-gemini-quota-reservation.js';

/** Database is the only supported source for Gemini credentials and model selection. */
export async function loadGeminiConfig(pool: Pick<Pool, 'query'>): Promise<{ key: string; model: string }> {
  const { rows } = await pool.query(
    "SELECT m.code AS model,c.credential_ciphertext FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id JOIN ai_provider_credentials c ON c.provider_id=p.id WHERE p.code='gemini' AND p.enabled=TRUE AND m.enabled=TRUE ORDER BY m.id LIMIT 1",
  );
  if (!rows.length) throw new Error('AI_GEMINI_DATABASE_CONFIG_MISSING');
  const key = decryptIntegrationCredential(rows[0].credential_ciphertext);
  if (!key || typeof rows[0].model !== 'string') throw new Error('AI_GEMINI_DATABASE_CONFIG_INVALID');
  return { key, model: rows[0].model };
}

export async function prepareGeminiRequest(pool: Pick<Pool, 'query'>, featureCode = 'issue_analysis'): Promise<{ key: string; model: string }> {
  const config = await loadGeminiConfig(pool);
  await reserveGeminiDailyRequest(pool, config.model, featureCode);
  return config;
}

export async function listGeminiFallbackModels(pool: Pick<Pool, 'query'>): Promise<Array<{model:string;key:string}>> {
  const result = await pool.query(
    "SELECT m.code AS model, c.credential_ciphertext FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id JOIN ai_provider_credentials c ON c.provider_id=p.id WHERE p.code='gemini' AND p.enabled=TRUE AND m.enabled=TRUE ORDER BY m.id LIMIT 2",
  );
  return result.rows.map((row: any) => ({ model: String(row.model), key: decryptIntegrationCredential(row.credential_ciphertext) }));
}

/** Exact Humas-selected Gemini model; never substitute a different Gemini model. */
export async function loadSelectedHumasGeminiModel(pool: Pick<Pool, 'query'>, taskCode: string): Promise<{key:string;model:string}> {
  const result = await pool.query(
    `SELECT p.code AS provider_code,p.enabled AS provider_enabled,m.code AS model,
       m.enabled AS model_enabled,c.credential_ciphertext
     FROM ai_humas_model_selections s
     JOIN ai_models m ON m.id=s.model_id
     JOIN ai_providers p ON p.id=m.provider_id
     LEFT JOIN ai_provider_credentials c ON c.provider_id=p.id
     WHERE s.task_code=$1 LIMIT 1`,[taskCode]);
  const row=result.rows[0];
  if(!row)throw new Error('AI_HUMAS_MODEL_SELECTION_MISSING');
  if(row.provider_code!=='gemini')throw new Error('AI_HUMAS_SELECTED_PROVIDER_NOT_GEMINI');
  if(!row.provider_enabled||!row.model_enabled)throw new Error('AI_HUMAS_SELECTED_MODEL_DISABLED');
  if(!row.credential_ciphertext)throw new Error('AI_HUMAS_GEMINI_CREDENTIAL_MISSING');
  const key=decryptIntegrationCredential(row.credential_ciphertext);
  if(!key)throw new Error('AI_HUMAS_GEMINI_CREDENTIAL_INVALID');
  return {key,model:String(row.model)};
}
