import type { Pool } from 'pg';
import { getExecutiveBrief } from './intelligence.js';
import { claimExecutiveBriefDay, completeExecutiveBriefDay, failExecutiveBriefDay } from './executive-brief-cache.js';

// The scheduler must call this once, after the daily ingestion window.
// There is deliberately no automatic timer or cron registration here.
export async function generateDailyExecutiveBrief(
  pool: Pool,
  date: string,
): Promise<{ status: 'created' | 'already_claimed' | 'failed'; date: string }> {
  const claimed = await claimExecutiveBriefDay(pool, date, 'city');
  if (!claimed) return { status: 'already_claimed', date };
  try {
    // Fail closed before invoking Gemini when all enabled models have no free-tier room.
    const quota = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM ai_free_tier_daily_limits l
         JOIN ai_models m ON m.id=l.model_id
         JOIN ai_providers p ON p.id=m.provider_id
         LEFT JOIN ai_free_tier_daily_usage u
           ON u.model_id=l.model_id AND u.usage_date=(now() AT TIME ZONE 'UTC')::date
         WHERE p.code='gemini' AND p.enabled=TRUE AND m.enabled=TRUE
           AND l.enabled=TRUE AND l.max_requests>COALESCE(u.reserved_requests,0)
       ) AS available`,
    );
    if (!quota.rows[0]?.available) {
      await failExecutiveBriefDay(pool, date, 'city', 'GEMINI_QUOTA_UNAVAILABLE');
      return { status: 'failed', date };
    }
    const brief = await getExecutiveBrief(pool, null);
    if (brief.mode !== 'ai' || !isValidBrief(brief)) {
      const code = typeof brief.provider_error_code === 'string' && /^GEMINI_[A-Z_0-9]{1,65}$/.test(brief.provider_error_code)
        ? brief.provider_error_code : 'AI_UNAVAILABLE_OR_FALLBACK';
      await failExecutiveBriefDay(pool, date, 'city', code);
      return { status: 'failed', date };
    }
    const saved = await completeExecutiveBriefDay(
      pool, date, 'city', brief as Record<string, unknown>,
      typeof brief.model_code === 'string' ? brief.model_code : null,
      typeof brief.source_count === 'number' ? brief.source_count : 0,
    );
    if (!saved) throw new Error('EXECUTIVE_BRIEF_CLAIM_LOST');
    return { status: 'created', date };
  } catch {
    await failExecutiveBriefDay(pool, date, 'city', 'EXECUTIVE_BRIEF_GENERATION_FAILED');
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
