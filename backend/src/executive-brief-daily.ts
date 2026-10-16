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
    const brief = await getExecutiveBrief(pool, null);
    if (brief.mode !== 'ai') {
      await failExecutiveBriefDay(pool, date, 'city', 'AI_UNAVAILABLE_OR_FALLBACK');
      return { status: 'failed', date };
    }
    const saved = await completeExecutiveBriefDay(
      pool, date, 'city', brief as Record<string, unknown>, null, 20,
    );
    if (!saved) throw new Error('EXECUTIVE_BRIEF_CLAIM_LOST');
    return { status: 'created', date };
  } catch (error) {
    await failExecutiveBriefDay(pool, date, 'city', 'EXECUTIVE_BRIEF_GENERATION_FAILED');
    return { status: 'failed', date };
  }
}
