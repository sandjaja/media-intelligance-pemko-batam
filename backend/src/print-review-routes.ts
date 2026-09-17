import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { analyzePrintRoutingV16 } from './print-v16-adapter.js';

declare module 'fastify' { interface FastifyRequest { printReviewAuth?: AuthorizationContext } }

export async function registerPrintReviewRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const ctx = await loadAuthorizationContext(pool, decoded.sub);
      if (!ctx?.active) return reply.code(403).send({ error: 'ACCOUNT_INACTIVE' });
      request.printReviewAuth = ctx;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const canReview = (ctx: AuthorizationContext) =>
    ctx.legacyRole === 'admin' || ctx.roles.includes('super_admin') || ctx.roles.includes('humas');

  app.get('/api/print/review-capability', { preHandler: auth }, async (request) => ({
    data: {
      canReviewAndVerify: canReview(request.printReviewAuth!),
      canAdvanceAnalysis: canReview(request.printReviewAuth!),
      canReopenAnalyzed: canReview(request.printReviewAuth!),
    },
  }));

  app.post('/api/print/articles/:id/review-verify', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printReviewAuth!;
    if (!canReview(ctx)) return reply.code(403).send({ error: 'REVIEW_VERIFY_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_ID' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT id,title,status FROM print_articles WHERE id=$1 FOR UPDATE`, [id.data])).rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      if (!['needs_review', 'verified'].includes(String(current.status))) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'INVALID_REVIEW_STATE', message: `Clipping berstatus ${current.status} tidak dapat diverifikasi dari alur review.` });
      }
      const verified = (await client.query(
        `UPDATE print_articles SET status='verified',verified_by=$2,verified_at=now(),updated_at=now() WHERE id=$1 RETURNING id,title,status,verified_by,verified_at,updated_at`,
        [id.data, ctx.id],
      )).rows[0];
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_REVIEW_VERIFIED',$2)`, [ctx.id, { printArticleId: id.data, previousStatus: current.status }]);
      await client.query('COMMIT');
      return { data: verified };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/print/articles/:id/mark-analyzed', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printReviewAuth!;
    if (!canReview(ctx)) return reply.code(403).send({ error: 'ANALYSIS_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_ID' });

    const current = (await pool.query(
      `SELECT pa.id,pa.title,pa.summary,pa.body_text,pa.status,pa.verified_by,pa.verified_at FROM print_articles pa WHERE pa.id=$1`,
      [id.data],
    )).rows[0];
    if (!current) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (String(current.status) !== 'verified') {
      return reply.code(409).send({ error: 'ARTICLE_MUST_BE_VERIFIED_FIRST', message: `Clipping harus berstatus Verified sebelum masuk ke Analyzed. Status saat ini: ${current.status}.` });
    }

    try {
      const analysis = await analyzePrintRoutingV16(pool, {
        title: current.title,
        summary: current.summary,
        bodyText: current.body_text,
      });

      if (analysis.routingStatus === 'AMBIGUOUS') {
        const keptVerified = (await pool.query(
          `UPDATE print_articles
           SET opd_id=NULL,
               ai_metadata=jsonb_set(COALESCE(ai_metadata,'{}'::jsonb),'{v16Routing}',$2::jsonb,true),
               updated_at=now()
           WHERE id=$1 AND status='verified'
           RETURNING id,title,status,opd_id,ai_metadata,verified_by,verified_at,updated_at`,
          [id.data, JSON.stringify(analysis)],
        )).rows[0];
        if (!keptVerified) return reply.code(409).send({ error: 'ARTICLE_STATE_CHANGED', message: 'Status clipping berubah saat proses analisis. Muat ulang data dan coba lagi.' });
        await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_ROUTING_AMBIGUOUS',$2)`, [ctx.id, {
          printArticleId: id.data,
          previousStatus: current.status,
          engine: analysis.engine,
          routingStatus: analysis.routingStatus,
          taxonomyId: analysis.taxonomyId,
          taxonomyName: analysis.taxonomyName,
          evidenceSource: analysis.evidenceSource,
          note: analysis.note,
        }]);
        return reply.code(409).send({
          error: 'PRINT_ROUTING_AMBIGUOUS',
          message: 'V16.5 belum memiliki evidence yang cukup untuk menentukan Primary OPD. Clipping tetap berstatus Verified.',
          data: keptVerified,
          analysis,
        });
      }

      const analyzed = (await pool.query(
        `UPDATE print_articles
         SET status='analyzed',
             opd_id=$2,
             sentiment=NULL,
             risk_score=0,
             importance_score=0,
             ai_metadata=jsonb_set(COALESCE(ai_metadata,'{}'::jsonb),'{v16Routing}',$3::jsonb,true),
             updated_at=now()
         WHERE id=$1 AND status='verified'
         RETURNING id,title,status,opd_id,sentiment,risk_score,importance_score,ai_metadata,verified_by,verified_at,updated_at`,
        [id.data, analysis.primaryOpdId, JSON.stringify(analysis)],
      )).rows[0];
      if (!analyzed) return reply.code(409).send({ error: 'ARTICLE_STATE_CHANGED', message: 'Status clipping berubah saat proses analisis. Muat ulang data dan coba lagi.' });

      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_ANALYZED',$2)`, [ctx.id, {
        printArticleId: id.data,
        previousStatus: current.status,
        engine: analysis.engine,
        routingStatus: analysis.routingStatus,
        primaryOpdId: analysis.primaryOpdId,
        supportingOpdIds: analysis.supportingOpdIds,
        keywordId: analysis.keywordId,
        keyword: analysis.keyword,
        taxonomyId: analysis.taxonomyId,
        taxonomyName: analysis.taxonomyName,
        matchType: analysis.matchType,
        evidenceSource: analysis.evidenceSource,
      }]);
      return { data: analyzed, analysis };
    } catch (error: any) {
      request.log.error({ err: error, printArticleId: id.data }, 'print V16.5 routing failed');
      return reply.code(500).send({ error: 'PRINT_ANALYSIS_FAILED', message: error?.message || 'Proses analisis gagal.' });
    }
  });

  app.post('/api/print/articles/:id/reopen', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printReviewAuth!;
    if (!canReview(ctx)) return reply.code(403).send({ error: 'REOPEN_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'INVALID_REOPEN_REQUEST' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT id,title,status,opd_id,sentiment,risk_score,importance_score,ai_metadata FROM print_articles WHERE id=$1 FOR UPDATE`, [id.data])).rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      if (String(current.status) !== 'analyzed') {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'ARTICLE_NOT_ANALYZED', message: `Hanya clipping berstatus Analyzed yang dapat dibuka kembali. Status saat ini: ${current.status}.` });
      }
      const reopened = (await client.query(
        `UPDATE print_articles
         SET status='verified',opd_id=NULL,sentiment=NULL,risk_score=0,importance_score=0,
             ai_metadata=(COALESCE(ai_metadata,'{}'::jsonb)-'phase2e'-'v16Routing'),updated_at=now()
         WHERE id=$1
         RETURNING id,title,status,opd_id,sentiment,risk_score,importance_score,ai_metadata,verified_by,verified_at,updated_at`,
        [id.data],
      )).rows[0];
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_REOPENED',$2)`, [ctx.id, {
        printArticleId: id.data,
        previousStatus: current.status,
        reason: body.data.reason,
        previousAnalysis: {
          opdId: current.opd_id,
          sentiment: current.sentiment,
          riskScore: current.risk_score,
          importanceScore: current.importance_score,
          phase2e: current.ai_metadata?.phase2e ?? null,
          v16Routing: current.ai_metadata?.v16Routing ?? null,
        },
      }]);
      await client.query('COMMIT');
      return { data: reopened };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
