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
