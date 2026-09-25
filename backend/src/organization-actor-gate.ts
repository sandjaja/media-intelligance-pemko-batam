import type { OnlineArticle } from './online-media-collector.js';
import type { OrganizationMediaScope, OrganizationUnitActor } from './organization-media-scope.js';

export type OrganizationScopeStatus = 'RELEVANT' | 'REVIEW' | 'OUT_OF_SCOPE';
export type OrganizationScopeDecision = { status: OrganizationScopeStatus; reason: string; matchedTerms: string[] };
export type OnlineNewsRole = 'UTAMA' | 'PENDUKUNG' | 'OUT_OF_SCOPE';
export type ActorMatch = { kind: 'ORGANIZATION' | 'OPD' | 'UPTD' | 'DISTRICT'; id: number | null; name: string; opdId: number | null };
export type OnlineNewsRoleDecision = { role: OnlineNewsRole; reason: string; scope: OrganizationScopeDecision; actorMatches: ActorMatch[] };

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function uniqueTerms(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(normalize).filter(v => v.length >= 3))];
}
function containsTerm(text: string, term: string): boolean {
  return !!text && !!term && (` ${text} `).includes(` ${term} `);
}
function roundupHeadline(title: string): boolean {
  return /\b(?:daftar\s+\d+\s+berita|berita\s+pilihan|rangkuman\s+berita|berita\s+terpopuler|berita\s+populer|top\s+\d+\s+berita)\b/i.test(normalize(title));
}

export function organizationScopeTerms(scope: OrganizationMediaScope) {
  const strong = uniqueTerms([scope.cityName, scope.organizationName, scope.governmentName, scope.shortName, ...scope.governmentAliases, ...scope.districts]);
  const supporting = uniqueTerms([scope.tagline, scope.organizationCode?.replace(/_/g, ' ')]);
  return { strong, supporting };
}

export function organizationScopeTokens(scope: OrganizationMediaScope): string[] {
  const { strong, supporting } = organizationScopeTerms(scope);
  return [...new Set([...strong, ...supporting].flatMap(term => term.split(/\s+/)).filter(token => token.length >= 3))];
}

export function classifyArticleOrganizationScope(article: OnlineArticle, scope: OrganizationMediaScope): OrganizationScopeDecision {
  const { strong, supporting } = organizationScopeTerms(scope);
  if (!strong.length) return { status: 'OUT_OF_SCOPE', reason: 'organization scope has no strong terms', matchedTerms: [] };
  const title = normalize(article.title);
  const context = normalize(`${article.title} ${article.excerpt ?? ''}`);
  const strongHits = strong.filter(term => containsTerm(context, term));
  const supportingHits = supporting.filter(term => containsTerm(context, term));
  if (roundupHeadline(title)) return { status: 'REVIEW', reason: 'roundup/list headline requires editorial review', matchedTerms: [...strongHits, ...supportingHits] };
  if (strongHits.length) return { status: 'RELEVANT', reason: 'title or lead contains organization/city/district scope term', matchedTerms: strongHits };
  if (supportingHits.length) return { status: 'REVIEW', reason: 'title or lead contains only supporting organization term', matchedTerms: supportingHits };
  const contextActorHits = scope.actors.flatMap(actor => actor.aliases.filter(term => containsTerm(context, normalize(term))));
  if (contextActorHits.length) return { status: 'REVIEW', reason: 'title or lead contains a known organization unit actor but no Batam-specific scope evidence', matchedTerms: uniqueTerms(contextActorHits) };
  return { status: 'OUT_OF_SCOPE', reason: 'title and lead have no organization/city/district scope term or known organization unit actor', matchedTerms: [] };
}

function matchUnitActor(title: string, actor: OrganizationUnitActor): ActorMatch | null {
  if (!actor.aliases.some(term => containsTerm(title, term))) return null;
  return { kind: actor.kind, id: actor.id, name: actor.name, opdId: actor.kind === 'OPD' ? actor.id : (actor.opdId ?? null) };
}

export function classifyOnlineArticleRole(article: OnlineArticle, scope: OrganizationMediaScope): OnlineNewsRoleDecision {
  const scopeDecision = classifyArticleOrganizationScope(article, scope);
  const title = normalize(article.title);
  const context = normalize(`${article.title} ${article.excerpt ?? ''}`);
  const actorMatches: ActorMatch[] = [];

  // An internal actor is sufficient even when the event itself occurs outside the organization's city.
  const organizationTerms = uniqueTerms([scope.organizationName, scope.governmentName, scope.shortName, ...scope.governmentAliases]);
  if (organizationTerms.some(term => containsTerm(context, term))) {
    actorMatches.push({ kind: 'ORGANIZATION', id: scope.organizationId, name: scope.shortName || scope.governmentName || scope.organizationName, opdId: null });
  }
  for (const actor of scope.actors) {
    const match = matchUnitActor(context, actor);
    if (match) actorMatches.push(match);
  }
  // Bare district names are locations, not actors. Require the administrative form "Kecamatan <name>".
  for (const district of scope.districts) {
    const d = normalize(district);
    if (d && containsTerm(context, `kecamatan ${d}`)) actorMatches.push({ kind: 'DISTRICT', id: null, name: `Kecamatan ${district}`, opdId: null });
  }

  // A generic OPD/UPTD name (for example a common agency acronym) is not enough by itself.\n  // The headline must first carry database-backed Batam organization/geographic scope.\n  if (actorMatches.length && scopeDecision.status === 'RELEVANT') return { role: 'UTAMA', reason: 'headline contains a database-backed internal government actor within confirmed organization scope', scope: scopeDecision, actorMatches };
  if (scopeDecision.status === 'OUT_OF_SCOPE') return { role: 'OUT_OF_SCOPE', reason: scopeDecision.reason, scope: scopeDecision, actorMatches: [] };
  return { role: 'PENDUKUNG', reason: scopeDecision.status === 'REVIEW' ? 'organization scope requires review and no internal actor is present' : 'in organization/city scope but no internal government actor is present', scope: scopeDecision, actorMatches: [] };
}
