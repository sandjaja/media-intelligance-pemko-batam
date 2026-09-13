import crypto from 'node:crypto';
import { Pool } from 'pg';
import { analyzeArticle } from './analyzer.js';
import { collectOnlineSource, type OnlineSource, type OnlineArticle } from './online-media-collector.js';

export type FeedSource = OnlineSource & { tier?: number; category?: string };
export type IngestedArticle = OnlineArticle;

export function fingerprint(title: string, url: string): string {
  return crypto.createHash('sha256').update(`${title.trim().toLowerCase()}|${url.trim().toLowerCase()}`).digest('hex');
}

function canonicalTitle(value:string):string {
  return String(value||'')
    .toLowerCase().normalize('NFKC')
    .replace(/\s*[-–—|]\s*(jawa\s*pos|batam\s*pos|antara(?:\s*news)?|tribun(?:news|\s*batam)?)(?:\.com)?\s*$/i,'')
    .replace(/[^\p{L}\p{N}\s]/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export async function fetchFeed(source: FeedSource): Promise<IngestedArticle[]> {
  return collectOnlineSource(source);
}

export async function ingestSource(pool: Pool, source: FeedSource): Promise<{ fetched: number; inserted: number; analyzed: number; duplicateSkipped: number }> {
  const checkedAt = new Date();
  try {
    const articles = await fetchFeed(source);
    const recent = (await pool.query(`SELECT title FROM articles WHERE source_id=$1 AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '14 days'`,[source.id])).rows;
    const knownTitles = new Set(recent.map(r=>canonicalTitle(r.title)).filter(Boolean));
    const seenThisRun = new Set<string>();
    let inserted = 0;
    let analyzed = 0;
    let duplicateSkipped = 0;
    for (const article of articles) {
      const canonical = canonicalTitle(article.title);
      if (canonical && (knownTitles.has(canonical) || seenThisRun.has(canonical))) {
        duplicateSkipped++;
        continue;
      }
      if (canonical) seenThisRun.add(canonical);
      const fp = fingerprint(article.title, article.url);
      const result = await pool.query(
        `INSERT INTO articles (source_id,title,url,published_at,content,summary,sentiment,importance_score)
         VALUES ($1,$2,$3,$4,$5,$5,'neutral',0)
         ON CONFLICT (url) DO NOTHING RETURNING id`,
        [article.sourceId, article.title, article.url, article.publishedAt, article.excerpt ?? null]
      );
      if (result.rowCount) {
        inserted++;
        if (canonical) knownTitles.add(canonical);
        const articleId = String(result.rows[0].id);
        const analysis = await analyzeArticle(pool, articleId);
        if (analysis) analyzed++;
        await pool.query(
          `INSERT INTO audit_logs (action,metadata) VALUES ('INGEST_ARTICLE',$1)`,
          [{ fingerprint: fp, canonicalTitle:canonical, articleId, sourceId: source.id, collector: 'online-hybrid-v3', analysis }]
        );
      }
    }
    await pool.query(
      `UPDATE media_sources
       SET last_checked_at=$2,last_success_at=$2,last_error=NULL,last_fetched_count=$3,last_inserted_count=$4
       WHERE id=$1`,
      [source.id, checkedAt, articles.length, inserted]
    );
    return { fetched: articles.length, inserted, analyzed, duplicateSkipped };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`UPDATE media_sources SET last_checked_at=$2,last_error=$3 WHERE id=$1`, [source.id, checkedAt, message]).catch(() => undefined);
    throw error;
  }
}

export async function ingestEnabledSources(pool: Pool): Promise<Record<string, unknown>[]> {
  const lock = await pool.query(`SELECT pg_try_advisory_lock(78124501) AS acquired`);
  if (!lock.rows[0]?.acquired) return [{ skipped: true, reason: 'another ingestion run is already active' }];
  const startedAt = new Date();
  let runId: string | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT id,name,url,tier,active,category
       FROM media_sources
       WHERE active=true AND url IS NOT NULL AND lower(category)='online'
       ORDER BY tier ASC,name ASC`
    );
    const run = await pool.query(
      `INSERT INTO ingestion_runs (started_at,source_count,status) VALUES ($1,$2,'running') RETURNING id`,
      [startedAt, rows.length]
    );
    runId = String(run.rows[0].id);
    const results: Record<string, unknown>[] = [];
    for (const source of rows) {
      try {
        results.push({ source: source.name, sourceId: String(source.id), collector: 'online-hybrid-v3', ...(await ingestSource(pool, source)) });
      } catch (error) {
        results.push({ source: source.name, sourceId: String(source.id), collector: 'online-hybrid-v3', error: error instanceof Error ? error.message : String(error) });
      }
    }
    const successfulSources = results.filter(r => !r.error).length;
    const failedSources = results.length - successfulSources;
    const fetchedCount = results.reduce((sum, r) => sum + (typeof r.fetched === 'number' ? r.fetched : 0), 0);
    const insertedCount = results.reduce((sum, r) => sum + (typeof r.inserted === 'number' ? r.inserted : 0), 0);
    await pool.query(
      `UPDATE ingestion_runs
       SET finished_at=NOW(),status='completed',successful_sources=$2,failed_sources=$3,fetched_count=$4,inserted_count=$5,details=$6
       WHERE id=$1`,
      [runId, successfulSources, failedSources, fetchedCount, insertedCount, JSON.stringify(results)]
    );
    return results;
  } catch (error) {
    if (runId) {
      await pool.query(
        `UPDATE ingestion_runs SET finished_at=NOW(),status='failed',error_message=$2 WHERE id=$1`,
        [runId, error instanceof Error ? error.message : String(error)]
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    await pool.query(`SELECT pg_advisory_unlock(78124501)`).catch(() => undefined);
  }
}
