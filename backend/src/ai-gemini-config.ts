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

export async function prepareGeminiRequest(pool: Pick<Pool, 'query'>): Promise<{ key: string; model: string }> {
  const config = await loadGeminiConfig(pool);
  await reserveGeminiDailyRequest(pool, config.model, 'issue_analysis');
  return config;
}
