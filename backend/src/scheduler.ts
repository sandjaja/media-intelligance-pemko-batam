import 'dotenv/config';
import { Pool } from 'pg';
import { ingestEnabledSources } from './ingestion.js';
import { generateDailyIntelligence } from './daily-intelligence.js';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const minutes = Math.max(1, Number(process.env.RUN_INTERVAL_MINUTES ?? 30));
const runOnStart = process.env.RUN_ON_START !== 'false';
const pool = new Pool({ connectionString: databaseUrl, max: 5 });

let timer: NodeJS.Timeout | undefined;
let shuttingDown = false;
let running = false;

async function runCycle() {
  if (shuttingDown || running) return;
  running = true;
  const startedAt = Date.now();
  const startedIso = new Date(startedAt).toISOString();

  try {
    const results = await ingestEnabledSources(pool);
    const dailyIntelligence = await generateDailyIntelligence(pool);
    const finishedAt = Date.now();
    console.log(JSON.stringify({
      event: 'intelligence_cycle_completed',
      startedAt: startedIso,
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      intervalMinutes: minutes,
      results,
      dailyIntelligence: {
        date: dailyIntelligence.date,
        status: dailyIntelligence.status,
        totalArticles: dailyIntelligence.metrics.totalArticles,
        negativeCount: dailyIntelligence.metrics.negativeCount,
        highRiskCount: dailyIntelligence.metrics.highRiskCount,
        topIssue: dailyIntelligence.topIssue?.title ?? null
      }
    }));
  } catch (error) {
    const finishedAt = Date.now();
    console.error(JSON.stringify({
      event: 'intelligence_cycle_failed',
      startedAt: startedIso,
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      error: error instanceof Error ? error.message : String(error)
    }));
  } finally {
    running = false;
  }
}

async function scheduleNext() {
  if (shuttingDown) return;
  await runCycle();
  if (shuttingDown) return;
  timer = setTimeout(() => { void scheduleNext(); }, minutes * 60_000);
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (timer) clearTimeout(timer);
  console.log(JSON.stringify({ event: 'scheduler_shutdown', signal }));
  while (running) await new Promise(resolve => setTimeout(resolve, 250));
  await pool.end();
  process.exit(0);
}

if (runOnStart) {
  await scheduleNext();
} else {
  timer = setTimeout(() => { void scheduleNext(); }, minutes * 60_000);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
