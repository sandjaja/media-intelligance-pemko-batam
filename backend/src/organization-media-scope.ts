import type { Pool } from 'pg';
import type { OnlineArticle } from './online-media-collector.js';

export type OrganizationMediaScope = {
  organizationId: number;
  organizationName: string;
  organizationCode?: string | null;
  governmentName?: string | null;
  shortName?: string | null;
  cityName?: string | null;
  provinceName?: string | null;
  tagline?: string | null;
  districts: string[];
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueTerms(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(normalize).filter(v => v.length >= 3))];
}

function containsTerm(text: string, term: string): boolean {
  if (!text || !term) return false;
  return (` ${text} `).includes(` ${term} `);
}

export async function loadOrganizationMediaScope(pool: Pool, organizationId?: number | null): Promise<OrganizationMediaScope | null> {
  let org:any;
  if (organizationId) {
    org = (await pool.query(`SELECT id,name,code FROM organizations WHERE id=$1 AND active=true LIMIT 1`, [organizationId])).rows[0];
  } else {
    const rows = (await pool.query(`SELECT id,name,code FROM organizations WHERE active=true ORDER BY id LIMIT 2`)).rows;
    if (rows.length !== 1) return null;
    org = rows[0];
  }
  if (!org) return null;

  const branding = (await pool.query(
    `SELECT government_name,short_name,city_name,province_name,tagline
       FROM government_branding
      ORDER BY id
      LIMIT 1`
  )).rows[0] ?? {};

  const districts = (await pool.query(
    `SELECT name FROM districts WHERE organization_id=$1 AND active=true ORDER BY name`,
    [org.id]
  )).rows.map(r => String(r.name || '').trim()).filter(Boolean);

  return {
    organizationId: Number(org.id),
    organizationName: String(org.name || ''),
    organizationCode: org.code ?? null,
    governmentName: branding.government_name ?? null,
    shortName: branding.short_name ?? null,
    cityName: branding.city_name ?? null,
    provinceName: branding.province_name ?? null,
    tagline: branding.tagline ?? null,
    districts,
  };
}

export function organizationScopeTerms(scope: OrganizationMediaScope): {
  strong: string[];
  supporting: string[];
} {
  const strong = uniqueTerms([
    scope.cityName,
    scope.organizationName,
    scope.governmentName,
    scope.shortName,
    ...scope.districts,
  ]);
  const supporting = uniqueTerms([
    scope.tagline,
    scope.provinceName,
    scope.organizationCode?.replace(/_/g, ' '),
  ]);
  return { strong, supporting };
}

export function organizationScopeTokens(scope: OrganizationMediaScope): string[] {
  const { strong, supporting } = organizationScopeTerms(scope);
  return [...new Set([...strong, ...supporting].flatMap(term => term.split(/\s+/)).filter(token => token.length >= 3))];
}

export function isArticleInOrganizationScope(article: OnlineArticle, scope: OrganizationMediaScope): boolean {
  const { strong, supporting } = organizationScopeTerms(scope);
  if (!strong.length) return true;

  const title = normalize(article.title);
  const lead = normalize(String(article.excerpt || '').slice(0, 1600));

  if (strong.some(term => containsTerm(title, term))) return true;
  if (strong.some(term => containsTerm(lead, term))) return true;

  const supportingHit = supporting.some(term => containsTerm(title, term) || containsTerm(lead, term));
  if (supportingHit && scope.cityName) {
    const city = normalize(scope.cityName);
    if (containsTerm(title, city) || containsTerm(lead, city)) return true;
  }

  return false;
}

export function filterArticlesByOrganizationScope(
  articles: OnlineArticle[],
  scope: OrganizationMediaScope | null
): OnlineArticle[] {
  if (!scope) return articles;
  return articles.filter(article => isArticleInOrganizationScope(article, scope));
}
