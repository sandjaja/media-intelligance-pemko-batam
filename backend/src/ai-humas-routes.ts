import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { loadAuthorizationContext } from './rbac.js';

// Deliberately separate from infrastructure administration. No secrets, prices or
// provider credentials are returned from this read-only operational endpoint.
const HUMAS_AI_TASKS = [
  'gap_analysis',
  'strakom_analysis',
  'publication_analysis',
  'monitoring_analysis',
  'content_studio_prompting',
] as const;

export async function registerAiHumasRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const guard = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof payload.sub !== 'string') return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
      const auth = await loadAuthorizationContext(pool, payload.sub);
      if (!auth?.active) return reply.code(401).send({ error: 'USER_INACTIVE_OR_MISSING' });
      if (!auth.roles.includes('humas') && !auth.roles.includes('super_admin') && auth.legacyRole !== 'admin') {
        return reply.code(403).send({ error: 'FORBIDDEN', permission: 'ai.operational.read' });
      }
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  app.get('/api/humas/ai/available-models', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.code AS provider_code, p.name AS provider_name,
                m.code AS model_code, m.name AS model_name
           FROM ai_models m
           JOIN ai_providers p ON p.id = m.provider_id
          WHERE p.enabled = TRUE AND m.enabled = TRUE
          ORDER BY p.name, m.name`,
      );
      return { data: rows, tasks: HUMAS_AI_TASKS };
    } catch {
      // AI tables may not yet be migrated in some installations.
      return reply.code(503).send({ error: 'AI_CATALOG_UNAVAILABLE' });
    }
  });
}
