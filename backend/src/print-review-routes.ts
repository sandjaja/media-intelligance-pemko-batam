import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

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
    ctx.roles.includes('super_admin') || ctx.roles.includes('humas');

  app.get('/api/print/review-capability', { preHandler: auth }, async (request) => ({
    data: {
      canReviewAndVerify: canReview(request.printReviewAuth!),
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
      const current = (await client.query(
        `SELECT id,title,status FROM print_articles WHERE id=$1 FOR UPDATE`,
        [id.data],
      )).rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }
      if (!['needs_review', 'verified'].includes(String(current.status))) {
        await client.query('ROLLBACK');
        return reply.code(409).send({
          error: 'INVALID_REVIEW_STATE',
          message: `Clipping berstatus ${current.status} tidak dapat diverifikasi dari alur review.`,
        });
      }

      const verified = (await client.query(
        `UPDATE print_articles
            SET status='verified', verified_by=$2, verified_at=now(), updated_at=now()
          WHERE id=$1
          RETURNING id,title,status,verified_by,verified_at,updated_at`,
        [id.data, ctx.id],
      )).rows[0];

      await client.query(
        `INSERT INTO audit_logs(user_id,action,metadata)
         VALUES($1,'PRINT_ARTICLE_REVIEW_VERIFIED',$2)`,
        [ctx.id, { printArticleId: id.data, previousStatus: current.status }],
      );
      await client.query('COMMIT');
      return { data: verified };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}
