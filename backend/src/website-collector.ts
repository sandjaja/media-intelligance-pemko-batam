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
const USER_AGENT = 'MediaIntelligenceBot/1.0 (+Pemko Batam media monitoring)';
const FETCH_TIMEOUT_MS = 7000;
const HTML_CRAWL_LIMIT = 8;
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
const decodeEntities = (value: string) => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>');
const stripHtml = (value?: string) => value ? decodeEntities(value)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim() : undefined;
const safeDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  const body = await response.text();
  return { response, body };
}

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

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const re of patterns) {
    const match = html.match(re)?.[1];
    if (match) return decodeEntities(match.trim());
  }
  return undefined;
}

function canonicalFromHtml(html: string, fallbackUrl: string) {
  const href = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[1];
  try { return href ? new URL(href, fallbackUrl).toString() : fallbackUrl; } catch { return fallbackUrl; }
}

function extractArticleLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const candidates: Array<{ url: string; text: string; score: number }> = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.hostname !== base.hostname || !/^https?:$/.test(url.protocol)) continue;
      url.hash = '';
      const text = stripHtml(match[2])?.trim() ?? '';
      if (text.length < 12) continue;
      const path = url.pathname.toLowerCase();
      if (path === '/' || /\/(tag|category|author|page|wp-admin|wp-content|feed)(\/|$)/.test(path)) continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3)$/i.test(path)) continue;
      const normalizedUrl = url.toString();
      if (seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      let score = 0;
      if (/\/20\d{2}\//.test(path)) score += 5;
      if (/berita|news|artikel|post/.test(path)) score += 3;
      if (path.split('/').filter(Boolean).length >= 2) score += 2;
      if (text.length >= 30) score += 2;
      candidates.push({ url: normalizedUrl, text, score });
    } catch { /* invalid link */ }
  }
  return candidates.sort((a,b)=>b.score-a.score).slice(0, HTML_CRAWL_LIMIT);
}

function extractArticleCandidate(html: string, url: string, linkText: string, account: WebsiteAccount): SocialCandidate | null {
  const title = metaContent(html, 'og:title')
    ?? stripHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    ?? stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    ?? linkText;
  if (!title || title.length < 5) return null;
  const canonicalUrl = canonicalFromHtml(html, url);
  const publishedAt = safeDate(
    metaContent(html, 'article:published_time')
    ?? metaContent(html, 'datePublished')
    ?? html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1]
  );
  const articleHtml = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? '';
  const content = stripHtml(articleHtml) ?? metaContent(html, 'description') ?? metaContent(html, 'og:description') ?? '';
  if (content.length < 40) return null;
  return {
    platform: 'website',
    externalId: canonicalUrl,
    contentType: 'article',
    sourceKind: 'owned',
    ownedAccountId: Number(account.id),
    opdId: account.opd_id == null ? null : Number(account.opd_id),
    authorName: account.account_name,
    authorHandle: account.handle,
    authorProfileUrl: account.profile_url,
    canonicalUrl,
    title: title.slice(0, 1000),
    content: content.slice(0, 100000),
    publishedAt,
    collector: 'website-html',
    rawPayload: {},
    metadata: { discoveredFrom: account.profile_url, crawlMode: 'html-fallback' },
  };
}

async function crawlWebsiteHtml(html: string, baseUrl: string, account: WebsiteAccount) {
  const links = extractArticleLinks(html, baseUrl);
  const settled = await Promise.allSettled(links.map(async(link)=>{
    const { response, body } = await fetchText(link.url);
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return null;
    return extractArticleCandidate(body, response.url || link.url, link.text, account);
  }));
  return settled
    .filter((r): r is PromiseFulfilledResult<SocialCandidate | null> => r.status === 'fulfilled')
    .map(r=>r.value)
    .filter((candidate): candidate is SocialCandidate => Boolean(candidate))
    .slice(0, HTML_CRAWL_LIMIT);
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

  const { response, body } = await fetchText(account.profile_url);
  if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const looksXml = contentType.includes('xml') || /^\s*<\?xml|^\s*<(rss|feed)\b/i.test(body);

  if (looksXml) {
    const candidates = parseWebsiteFeed(body, account, response.url || account.profile_url);
    const result = await ingestSocialBatch(pool, candidates, 'website-rss');
    return { accountId: Number(account.id), accountName: account.account_name, mode: 'rss-direct', feedUrl: response.url || account.profile_url, fetched: candidates.length, ...result };
  }

  const pageUrl = response.url || account.profile_url;
  const discovered = discoverFeedUrl(body, pageUrl);
  if (discovered) {
    try {
      const feed = await fetchText(discovered);
      const feedLooksXml = feed.response.ok && (feed.response.headers.get('content-type')?.toLowerCase().includes('xml') || /^\s*<\?xml|^\s*<(rss|feed)\b/i.test(feed.body));
      if (feedLooksXml) {
        const candidates = parseWebsiteFeed(feed.body, account, feed.response.url || discovered);
        if (candidates.length) {
          const result = await ingestSocialBatch(pool, candidates, 'website-rss');
          return { accountId: Number(account.id), accountName: account.account_name, mode: 'rss-autodiscovery', feedUrl: feed.response.url || discovered, fetched: candidates.length, ...result };
        }
      }
    } catch { /* feed unavailable: continue with HTML fallback */ }
  }

  const candidates = await crawlWebsiteHtml(body, pageUrl, account);
  if (!candidates.length) throw new Error('RSS/Atom gagal dan artikel HTML tidak dapat diekstrak');
  const result = await ingestSocialBatch(pool, candidates, 'website-html');
  return { accountId: Number(account.id), accountName: account.account_name, mode: 'html-fallback', feedUrl: discovered, fetched: candidates.length, ...result };
}
