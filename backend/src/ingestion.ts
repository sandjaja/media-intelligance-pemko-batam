import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { Pool } from 'pg';

export type FeedSource = { id: string; name: string; url: string; tier?: number; active?: boolean };
export type IngestedArticle = { sourceId: string; title: string; url: string; publishedAt: Date; excerpt?: string };
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const asArray = <T>(value: T | T[] | undefined): T[] => value == null ? [] : Array.isArray(value) ? value : [value];
const firstString = (...values: unknown[]): string | undefined => values.find(v => typeof v === 'string' && v.trim()) as string | undefined;
const parseDate = (value?: string): Date => { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d; };
export function fingerprint(title: string, url: string): string { return crypto.createHash('sha256').update(`${title.trim().toLowerCase()}|${url.trim().toLowerCase()}`).digest('hex'); }

export async function fetchFeed(source: FeedSource): Promise<IngestedArticle[]> {
  if (source.active === false) return [];
  const response = await fetch(source.url, { headers: { 'user-agent': 'MediaIntelligenceBot/1.0 (+Pemko Batam media monitoring)' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Feed ${source.name} returned HTTP ${response.status}`);
  const root = parser.parse(await response.text());
  const items = asArray(root?.rss?.channel?.item ?? root?.feed?.entry);
  return items.map((item: any) => {
    const title = firstString(item.title?.['#text'], item.title, item['media:title']);
    const url = firstString(item.link?.['@_href'], item.link, item.guid, item.id);
    if (!title || !url) return null;
    return { sourceId: source.id, title: title.trim(), url: url.trim(), publishedAt: parseDate(firstString(item.pubDate, item.published, item.updated, item['dc:date'])), excerpt: firstString(item.description, item.summary, item['content:encoded'])?.slice(0, 5000) };
  }).filter(Boolean) as IngestedArticle[];
}

export async function ingestSource(pool: Pool, source: FeedSource): Promise<{ fetched: number; inserted: number }> {
  const articles = await fetchFeed(source); let inserted = 0;
  for (const article of articles) {
    const fp = fingerprint(article.title, article.url);
    const result = await pool.query(`INSERT INTO articles (source_id,title,url,published_at,content,sentiment,importance_score) VALUES ($1,$2,$3,$4,$5,'neutral',0) ON CONFLICT (url) DO NOTHING RETURNING id`, [article.sourceId, article.title, article.url, article.publishedAt, article.excerpt ?? null]);
    if (result.rowCount) { inserted++; await pool.query(`INSERT INTO audit_logs (action,metadata) VALUES ('INGEST_ARTICLE',$1)`, [{ fingerprint: fp, articleId: result.rows[0].id, sourceId: source.id }]); }
  }
  return { fetched: articles.length, inserted };
}

export async function ingestEnabledSources(pool: Pool): Promise<Record<string, unknown>[]> {
  const { rows } = await pool.query(`SELECT id,name,url,tier,active FROM media_sources WHERE active=true AND url IS NOT NULL`); const results: Record<string, unknown>[] = [];
  for (const source of rows) { try { results.push({ source: source.name, ...(await ingestSource(pool, source)) }); } catch (error) { results.push({ source: source.name, error: error instanceof Error ? error.message : String(error) }); } }
  return results;
}
