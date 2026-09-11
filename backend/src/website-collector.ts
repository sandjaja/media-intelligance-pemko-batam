import { XMLParser } from 'fast-xml-parser';
import type { Pool } from 'pg';
import { ingestSocialBatch, type SocialCandidate } from './social-collector.js';

type WebsiteAccount = {
  id: string;
  opd_id: string | null;
  account_name: string;
  handle: string;
  profile_url: string | null;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const asArray = <T>(value: T | T[] | undefined): T[] => value == null ? [] : Array.isArray(value) ? value : [value];
const textValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    const text = (value as Record<string, unknown>)['#text'];
    return typeof text === 'string' ? text.trim() || undefined : undefined;
  }
  return undefined;
};
const firstString = (...values: unknown[]) => values.map(textValue).find(Boolean);
const stripHtml = (value?: string) => value?.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
const safeDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function discoverFeedUrl(html: string, baseUrl: string) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !rel.includes('alternate') || (!type.includes('rss') && !type.includes('atom') && !type.includes('xml'))) continue;
    try { return new URL(href, baseUrl).toString(); } catch { /* ignore invalid feed URL */ }
  }
  return null;
}

async function fetchFeedDocument(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: { 'user-agent': 'MediaIntelligenceBot/1.0 (+Pemko Batam media monitoring)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
  const body = await response.text();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const looksXml = contentType.includes('xml') || /^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body);
  if (looksXml) return { feedUrl: sourceUrl, xml: body };

  const discovered = discoverFeedUrl(body, response.url || sourceUrl);
  if (!discovered) throw new Error('RSS/Atom feed tidak ditemukan pada website');
  const feedResponse = await fetch(discovered, {
    headers: { 'user-agent': 'MediaIntelligenceBot/1.0 (+Pemko Batam media monitoring)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!feedResponse.ok) throw new Error(`Feed website returned HTTP ${feedResponse.status}`);
  return { feedUrl: discovered, xml: await feedResponse.text() };
}

function parseWebsiteFeed(xml: string, account: WebsiteAccount, feedUrl: string): SocialCandidate[] {
  const root = parser.parse(xml);
  const items = asArray<any>(root?.rss?.channel?.item ?? root?.feed?.entry);
  return items.slice(0, 100).map((item: any) => {
    const title = firstString(item.title, item.title?.['#text'], item['media:title']);
    const canonicalUrl = firstString(item.link?.['@_href'], item.link, item.guid, item.id);
    if (!title || !canonicalUrl) return null;
    const rawContent = firstString(item['content:encoded'], item.content, item.summary, item.description);
    const publishedAt = safeDate(firstString(item.pubDate, item.published, item.updated, item['dc:date']));
    const externalId = firstString(item.guid, item.id, canonicalUrl) ?? canonicalUrl;
    return {
      platform: 'website' as const,
      externalId,
      contentType: 'article' as const,
      sourceKind: 'owned' as const,
      ownedAccountId: Number(account.id),
      opdId: account.opd_id == null ? null : Number(account.opd_id),
      authorName: account.account_name,
      authorHandle: account.handle,
      authorProfileUrl: account.profile_url,
      canonicalUrl,
      title,
      content: stripHtml(rawContent)?.slice(0, 100000) ?? null,
      publishedAt,
      collector: 'website-rss',
      rawPayload: item,
      metadata: { feedUrl },
    } satisfies SocialCandidate;
  }).filter(Boolean) as SocialCandidate[];
}

export async function collectOwnedWebsiteAccount(pool: Pool, accountId: number) {
  const { rows } = await pool.query<WebsiteAccount>(
    `SELECT id,opd_id,account_name,handle,profile_url
       FROM owned_social_accounts
      WHERE id=$1 AND platform='website' AND active=true
      LIMIT 1`,
    [accountId],
  );
  const account = rows[0];
  if (!account) throw new Error('WEBSITE_ACCOUNT_NOT_FOUND');
  if (!account.profile_url) throw new Error('WEBSITE_PROFILE_URL_MISSING');

  const { feedUrl, xml } = await fetchFeedDocument(account.profile_url);
  const candidates = parseWebsiteFeed(xml, account, feedUrl);
  const result = await ingestSocialBatch(pool, candidates, 'website-rss');
  return { accountId: Number(account.id), accountName: account.account_name, feedUrl, fetched: candidates.length, ...result };
}
