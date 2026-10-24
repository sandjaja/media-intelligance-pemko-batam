import type { Pool } from 'pg';
import { getExecutiveBrief } from './intelligence.js';
import { claimExecutiveBriefDay, completeExecutiveBriefDay, failExecutiveBriefDay, claimExecutiveBriefRetry, failExecutiveBriefRetry } from './executive-brief-cache.js';

// The scheduler must call this once, after the daily ingestion window.
// There is deliberately no automatic timer or cron registration here.
export async function generateDailyExecutiveBrief(
  pool: Pool,
  date: string,
  manualRetry = false,
): Promise<{ status: 'created' | 'already_claimed' | 'failed'; date: string }> {
  const claimed = manualRetry ? await claimExecutiveBriefRetry(pool, date) : await claimExecutiveBriefDay(pool, date, 'city');
  if (!claimed) return { status: 'already_claimed', date };
  const recordFailure = (code: string) => manualRetry ? failExecutiveBriefRetry(pool,date,code) : failExecutiveBriefDay(pool,date,'city',code);
  try {
    // Shared provider reservation remains the quota guard; empty snapshots use no AI.
    const brief = await getExecutiveBrief(pool, null);
    if (!['ai','database-no-data'].includes(String(brief.mode)) || !isValidBrief(brief)) {
      const code = typeof brief.provider_error_code === 'string' && /^(?:GEMINI|AI_GEMINI)_[A-Z_0-9]{1,65}$/.test(brief.provider_error_code)
        ? brief.provider_error_code
        : brief.mode === 'ai' ? 'EXECUTIVE_BRIEF_INVALID_RESPONSE' : 'AI_UNAVAILABLE_OR_FALLBACK';
      await recordFailure(code);
      return { status: 'failed', date };
    }
    const saved = await completeExecutiveBriefDay(
      pool, date, 'city', brief as Record<string, unknown>,
      typeof brief.model_code === 'string' ? brief.model_code : null,
      typeof brief.source_count === 'number' ? brief.source_count : 0,manualRetry,
    );
    if (!saved) throw new Error('EXECUTIVE_BRIEF_CLAIM_LOST');
    return { status: 'created', date };
  } catch {
    await recordFailure('EXECUTIVE_BRIEF_GENERATION_FAILED');
    return { status: 'failed', date };
  }
}

export function isValidBrief(brief: Record<string, unknown>): boolean {
  return typeof brief.headline === 'string' && brief.headline.trim().length > 0
    && typeof brief.situation === 'string' && brief.situation.trim().length > 0
    && typeof brief.implications === 'string'
    && Array.isArray(brief.actions) && brief.actions.length > 0
    && brief.actions.every(action => typeof action === 'string')
    && ['WATCH','MEDIUM','HIGH','IMMEDIATE'].includes(String(brief.priority));
}
