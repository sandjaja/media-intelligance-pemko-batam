import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

export type H1EvidenceRef = { sourceType: 'online' | 'print' | 'social' | 'owned'; id: number };
export const h1Fingerprint = (evidence: H1EvidenceRef[]): string =>
  createHash('sha256').update(JSON.stringify([...new Set(evidence.map(e => `${e.sourceType}:${e.id}`))].sort())).digest('hex');

/**
 * Claims a single organization/date/fingerprint across concurrent Humas sessions.
 * Requires migration 160. No Gemini request is made here.
 * A completed fingerprint can never be claimed again.
 * Expired running leases are deliberately NOT auto-retried: quota might have been
 * consumed before the worker died, so an operator must explicitly reconcile it.
 */
export async function claimIssueLinkageH1Batch(
  pool: Pool,
  organizationId: number,
  newsDate: string,
  fingerprint: string,
  evidenceCount: number,
): Promise<{ claimed: boolean; id: number | null; status: string }> {
  const result = await pool.query(
    `INSERT INTO issue_linkage_h1_batches
       (organization_id, news_date, fingerprint, status, evidence_count, started_at, lease_expires_at)
     VALUES ($1, $2::date, $3, 'running', $4, now(), now() + interval '5 minutes')
     ON CONFLICT (organization_id, news_date, fingerprint) DO NOTHING
     RETURNING id`,
    [organizationId, newsDate, fingerprint, evidenceCount],
  );
  if (result.rows[0]) return { claimed: true, id: Number(result.rows[0].id), status: 'running' };
  const existing = await pool.query(
    `SELECT id, status FROM issue_linkage_h1_batches
     WHERE organization_id=$1 AND news_date=$2::date AND fingerprint=$3`,
    [organizationId, newsDate, fingerprint],
  );
  return { claimed: false, id: existing.rows[0] ? Number(existing.rows[0].id) : null, status: String(existing.rows[0]?.status || 'unknown') };
}

export async function finishIssueLinkageH1Batch(
  pool: Pool,
  id: number,
  status: 'completed' | 'failed',
  requestCount: number,
  errorCode?: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE issue_linkage_h1_batches SET status=$2, request_count=$3,
      error_code=$4, finished_at=now(), lease_expires_at=NULL, updated_at=now()
     WHERE id=$1 AND status='running' RETURNING id`,
    [id, status, requestCount, errorCode || null],
  );
  return (result.rowCount || 0) === 1;
}

/** Strict H-1 selection by publication time in WIB, never by ingestion time.
 * Invalid/missing dates are excluded rather than guessed.
 */
export function selectYesterdayWibEvidence<T extends H1EvidenceRef & { occurredAt?: string | null }>(
  evidence: T[],
  now: Date = new Date(),
): { date: string; evidence: T[] } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const day = (value: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const date = day(new Date(now.getTime() - 86400000));
  const selected = new Map<string, T>();
  for (const item of evidence) {
    if (!item.occurredAt || !Number.isInteger(item.id) || item.id <= 0 ||
        !['online', 'print', 'social', 'owned'].includes(item.sourceType)) continue;
    const published = new Date(item.occurredAt);
    if (!Number.isFinite(published.getTime()) || day(published) !== date) continue;
    const ref = `${item.sourceType}:${item.id}`;
    const previous = selected.get(ref);
    // Duplicate candidate snapshots may disagree: retain the most complete
    // keyword/OPD metadata, never discard an earlier useful classification.
    if (!previous) {
      selected.set(ref, item);
    } else {
      const keyword = (value: T) => String((value as T & { primaryKeyword?: string | null }).primaryKeyword || '').trim();
      const opd = (value: T) => Number((value as T & { opdId?: number | null }).opdId || 0);
      selected.set(ref, {
        ...previous, ...item,
        primaryKeyword: keyword(item) || keyword(previous) || null,
        opdId: opd(item) > 0 ? opd(item) : opd(previous) > 0 ? opd(previous) : null,
      } as T);
    }
  }
  return { date, evidence: [...selected.values()] };
}

/** Flag suspect dates for human review; never rewrite publication timestamps.
 * Only explicit ISO dates near the start of a title/summary are considered.
 */
export function publicationDateNeedsReview(
  occurredAt: string | null | undefined,
  title: string | null | undefined,
  summary: string | null | undefined,
): boolean {
  if (!occurredAt) return false;
  const stored = new Date(occurredAt);
  if (!Number.isFinite(stored.getTime())) return false;
  const head = [title || '', (summary || '').slice(0,180)].join(' ');
  const iso = head.match(/\\b(20\\d{2})-(\\d{2})-(\\d{2})\\b/);
  const months: Record<string, number> = {
    januari:1, februari:2, maret:3, april:4, mei:5, juni:6,
    juli:7, agustus:8, september:9, oktober:10, november:11, desember:12,
  };
  const indonesian = head.toLowerCase().match(/\\b(\\d{1,2})\\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\\s+(20\\d{2})\\b/);
  const year = iso ? Number(iso[1]) : indonesian ? Number(indonesian[3]) : 0;
  const month = iso ? Number(iso[2]) : indonesian ? months[indonesian[2]] : 0;
  const day = iso ? Number(iso[3]) : indonesian ? Number(indonesian[1]) : 0;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const embedded = new Date(Date.UTC(year, month - 1, day));
  if (embedded.getUTCFullYear() !== year || embedded.getUTCMonth() !== month - 1 ||
      embedded.getUTCDate() !== day) return false;
  return Math.abs(stored.getTime() - embedded.getTime()) > 2 * 86400000;
}

/** Include classification in the plan identity: changing a keyword or OPD
 * must invalidate a previously prepared batch even if evidence IDs are unchanged.
 */
export function h1ClassifiedPlanFingerprint(
  groups: Array<{ primaryKeyword: string; opdId: number | null; evidence: H1EvidenceRef[] }>,
): string {
  const rows = groups.flatMap(group => group.evidence.map(e =>
    [e.sourceType, e.id, group.primaryKeyword, group.opdId ?? 'none'].join('|')));
  return createHash('sha256').update(JSON.stringify([...new Set(rows)].sort())).digest('hex');
}

/** Verify that a submitted H-1 plan still matches the server's freshly computed
 * bounded evidence set before claiming a DB lock or spending Gemini quota.
 */
export function validateH1ExecutionPlan(
  expectedDate: string,
  expectedFingerprint: string,
  actualDate: string,
  plannedEvidence: H1EvidenceRef[],
  classifiedFingerprint?: string,
): { valid: boolean; reason: string | null; fingerprint: string } {
  const fingerprint = classifiedFingerprint ?? h1Fingerprint(plannedEvidence);
  if (!/^20\\d{2}-\\d{2}-\\d{2}$/.test(expectedDate) || expectedDate !== actualDate) {
    return { valid: false, reason: 'H1_DATE_CHANGED', fingerprint };
  }
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint) || expectedFingerprint !== fingerprint) {
    return { valid: false, reason: 'H1_PLAN_CHANGED', fingerprint };
  }
  if (plannedEvidence.length === 0 || plannedEvidence.length > 200) {
    return { valid: false, reason: 'H1_PLAN_SIZE_INVALID', fingerprint };
  }
  return { valid: true, reason: null, fingerprint };
}

/** Must match the existing Issue Linkage inbox cache lookup exactly.
 * Unlike the batch claim SHA-256, this includes the primary keyword.
 */
export function inboxContextFingerprint(primaryKeyword: string | null, evidence: H1EvidenceRef[]): string {
  const normalized = String(primaryKeyword || '').toLowerCase().normalize('NFKC')
    .replace(/[^\\p{L}\\p{N}\\s-]/gu, ' ').replace(/\\s+/g, ' ').trim();
  return [normalized, ...evidence.map(e => `${e.sourceType}:${e.id}`).sort()].join('|');
}

/** Store a successful AI-context result under the same fingerprint used by inbox reads.
 * The caller must hold the H-1 batch claim; this function does not invoke Gemini.
 */
export async function persistH1LinkageContext(
  pool: Pool,
  organizationId: number,
  fingerprint: string,
  issueId: number,
  candidateKeys: string[],
  context: { mode: string; groups: unknown[] },
): Promise<boolean> {
  if (context.mode !== 'ai-context' || !Array.isArray(context.groups) || context.groups.length === 0) return false;
  await pool.query(
    `INSERT INTO audit_logs(user_id,action,metadata)
     VALUES(NULL,'ISSUE_LINKAGE_CONTEXT_MATCHED',$1::jsonb)`,
    [JSON.stringify({ organizationId, fingerprint, issueId, candidateKeys, context })],
  );
  return true;
}

/** Deterministic H-1 groups. Never merge evidence from different OPDs.
 * Empty primary keywords are deliberately isolated by evidence reference.
 */
export function groupH1Evidence<T extends H1EvidenceRef & {
  primaryKeyword?: string | null; opdId?: number | null;
}>(evidence: T[]): Array<{ key: string; primaryKeyword: string; opdId: number | null; evidence: T[] }> {
  const groups = new Map<string, { key: string; primaryKeyword: string; opdId: number | null; evidence: T[] }>();
  const seen = new Set<string>();
  for (const item of evidence) {
    const ref = `${item.sourceType}:${item.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const keyword = String(item.primaryKeyword || '').toLowerCase().normalize('NFKC')
      .replace(/[^\\p{L}\\p{N}\\s-]/gu, ' ').replace(/\\s+/g, ' ').trim();
    const opdId = Number.isInteger(item.opdId) && Number(item.opdId) > 0 ? Number(item.opdId) : null;
    const key = keyword ? `${keyword}|opd:${opdId ?? 'none'}` : `unclassified|${ref}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, primaryKeyword: keyword, opdId, evidence: [] };
      groups.set(key, group);
    }
    group.evidence.push(item);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
