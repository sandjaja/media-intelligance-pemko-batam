import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printIssueAuth?: AuthorizationContext } }

type Phase2EAnalysisLike = {
  issueCategory?: string;
  officialKeywordMatches?: Array<{ keyword: string; opdId?: number | null }>;
  operatorKeywordMatches?: Array<{ keyword: string }>;
  entityValidation?: {
    selected?: { opdId?: number | null; districtId?: number | null };
    detected?: { opd?: { id: number } | null; district?: { id: number } | null };
  };
};

export type IssueLinkageCandidate = {
  issueId: number;
  title: string;
  status: string;
  score: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence: string[];
  linkageStatus: 'candidate' | 'linked';
};

export type IssueLinkageResult = {
  engine: string;
  generatedAt: string;
  candidateCount: number;
  linkedIssueId: number | null;
  candidates: IssueLinkageCandidate[];
  note: string;
  degraded?: boolean;
};

/* Phase 2E core analysis must not depend on issue-clustering persistence. */
export async function evaluatePrintIssueLinkage(
  _client: PoolClient,
  _article: any,
  _analysis: Phase2EAnalysisLike,
): Promise<IssueLinkageResult> {
  return {
    engine: 'phase2e-issue-link-v1-deferred',
    generatedAt: new Date().toISOString(),
    candidateCount: 0,
    linkedIssueId: null,
    candidates: [],
    degraded: true,
    note: 'Issue linkage ditunda dan dipisahkan dari proses analisis utama agar proses Verified → Analyzed tidak dapat terblokir oleh clustering.',
  };
}

export async function registerPrintIssueLinkageRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const ctx = await loadAuthorizationContext(pool, decoded.sub);
      if (!ctx?.active) return reply.code(403).send({ error: 'ACCOUNT_INACTIVE' });
      request.printIssueAuth = ctx;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const canManage = (ctx: AuthorizationContext) =>
    ctx.legacyRole === 'admin' || ctx.roles.includes('super_admin') || ctx.roles.includes('humas');

  app.get('/api/print/articles/:id/issue-linkage', { preHandler: auth }, async (request, reply) => {
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_ID' });
    return { data: [], degraded: true, message: 'Issue linkage sementara dipisahkan dari analisis utama.' };
  });

  app.post('/api/print/articles/:id/issue-linkage/:issueId/decision', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printIssueAuth!;
    if (!canManage(ctx)) return reply.code(403).send({ error: 'ISSUE_LINK_DECISION_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    return reply.code(409).send({
      error: 'ISSUE_LINKAGE_TEMPORARILY_DEFERRED',
      message: 'Issue linkage sedang dipisahkan dari proses analisis utama dan akan diaktifkan kembali setelah stabil.',
    });
  });
}
