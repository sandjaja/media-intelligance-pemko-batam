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

  app.get('/api/humas/ai/usage-summary', { preHandler: guard }, async (request, reply) => {
    try {
      const token=request.cookies.access_token;
      if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
      const payload=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof payload.sub!=='string')return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});
      const { rows } = await pool.query(
        `SELECT t.code AS task_code, p.code AS provider_code, m.code AS model_code,
                COUNT(*)::integer AS requests,
                COALESCE(SUM(l.input_tokens), 0)::text AS input_tokens,
                COALESCE(SUM(l.output_tokens), 0)::text AS output_tokens,
                (COALESCE(SUM(l.input_tokens), 0)+COALESCE(SUM(l.output_tokens), 0))::text AS total_tokens,
                COUNT(*) FILTER (WHERE l.status NOT IN ('success', 'ok'))::integer AS non_success_requests
           FROM ai_usage_logs l
           JOIN ai_tasks t ON t.id = l.task_id
           LEFT JOIN ai_providers p ON p.id = l.provider_id
           LEFT JOIN ai_models m ON m.id = l.model_id
          WHERE t.code = ANY($1::text[])
            AND l.created_at >= date_trunc('month', now())
            AND l.user_id = $2
          GROUP BY t.code, p.code, m.code
          ORDER BY t.code, p.code, m.code`,
        [HUMAS_AI_TASKS,payload.sub],
      );
      // Remaining credit cannot be inferred from usage totals.
      // Explicitly return null rather than fabricating remaining tokens or credit.
      return {
        period: 'current_month',
        data: rows,
        remaining_tokens: null,
        remaining_budget: null,
        balance_status: 'not_configured',
      };
    } catch {
      return reply.code(503).send({ error: 'AI_USAGE_UNAVAILABLE' });
    }
  });

  // Read-only routing preview. A configured route is not proof that budget checks
  // or provider execution are enabled; generation must enforce those separately.
  app.get('/api/humas/ai/task-routes', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT t.code AS task_code, p.code AS provider_code,
                m.code AS model_code, r.priority, r.fallback_enabled
           FROM ai_task_routes r
           JOIN ai_tasks t ON t.id = r.task_id
           JOIN ai_providers p ON p.id = r.provider_id
           JOIN ai_models m ON m.id = r.model_id AND m.provider_id = p.id
          WHERE t.code = ANY($1::text[])
            AND t.enabled = TRUE AND r.enabled = TRUE
            AND p.enabled = TRUE AND m.enabled = TRUE
          ORDER BY t.code, r.priority`,
        [HUMAS_AI_TASKS],
      );
      return { data: rows, execution_ready: false };
    } catch {
      return reply.code(503).send({ error: 'AI_ROUTES_UNAVAILABLE' });
    }
  });

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
