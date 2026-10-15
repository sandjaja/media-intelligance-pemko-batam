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

  // Humas may monitor quotas, but only Super Admin may change their limits.
  app.get('/api/humas/ai/gemini-quotas', { preHandler: guard }, async (_request, reply) => {
    try {
      const exists = await pool.query("SELECT to_regclass('public.ai_free_tier_daily_limits') IS NOT NULL AS available");
      if (!exists.rows[0]?.available) return reply.code(503).send({ error: 'AI_GEMINI_QUOTA_MIGRATION_REQUIRED' });
      const { rows } = await pool.query(`SELECT m.code AS model_code,m.name AS model_name,
        l.max_requests,COALESCE(l.enabled,FALSE) AS enabled,
        COALESCE(u.reserved_requests,0)::int AS reserved_today
        FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id
        LEFT JOIN ai_free_tier_daily_limits l ON l.model_id=m.id
        LEFT JOIN ai_free_tier_daily_usage u ON u.model_id=m.id
          AND u.usage_date=(now() AT TIME ZONE 'UTC')::date
        WHERE p.code='gemini' ORDER BY m.code`);
      return { data: rows, timezone: 'UTC', read_only: true };
    } catch {
      return reply.code(503).send({ error: 'AI_GEMINI_QUOTA_UNAVAILABLE' });
    }
  });

  // Editable only for the five explicitly agreed Humas analysis tasks.
  // No runtime AI call reads these settings until each legacy prompt is migrated.
  app.get('/api/humas/ai/prompts', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        'SELECT task_code,prompt_text,default_prompt_text,version,updated_at FROM ai_humas_task_prompts WHERE task_code = ANY($1::text[]) ORDER BY task_code',
        [HUMAS_AI_TASKS],
      );
      return { data: rows, editable_tasks: HUMAS_AI_TASKS, execution_ready: false };
    } catch {
      return reply.code(503).send({ error: 'AI_PROMPT_STORAGE_UNAVAILABLE' });
    }
  });

  // Read-only version history; previous prompts are retained for audit and optional manual restore.
  app.get('/api/humas/ai/prompts/:taskCode/history', { preHandler: guard }, async (request, reply) => {
    const taskCode = (request.params as { taskCode?: string }).taskCode;
    if (!taskCode || !(HUMAS_AI_TASKS as readonly string[]).includes(taskCode)) {
      return reply.code(400).send({ error: 'AI_PROMPT_INVALID_TASK' });
    }
    try {
      const { rows } = await pool.query(
        'SELECT version,prompt_text,changed_at FROM ai_humas_task_prompt_history WHERE task_code=$1 ORDER BY version DESC LIMIT 10',
        [taskCode],
      );
      return { data: rows };
    } catch {
      return reply.code(503).send({ error: 'AI_PROMPT_HISTORY_UNAVAILABLE' });
    }
  });

  app.put('/api/humas/ai/prompts/:taskCode', { preHandler: guard }, async (request, reply) => {
    const taskCode = (request.params as { taskCode?: string }).taskCode;
    const body = request.body as { prompt?: unknown; expectedVersion?: unknown } | null;
    if (!taskCode || !(HUMAS_AI_TASKS as readonly string[]).includes(taskCode) ||
        typeof body?.prompt !== 'string' || body.prompt.trim().length < 20 ||
        body.prompt.length > 30000 || !Number.isSafeInteger(body.expectedVersion) ||
        (body.expectedVersion as number) < 1) {
      return reply.code(400).send({ error: 'AI_PROMPT_INVALID' });
    }
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    let client;
    try { client = await pool.connect(); } catch { return reply.code(503).send({ error: 'AI_PROMPT_STORAGE_UNAVAILABLE' }); }
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT version,prompt_text FROM ai_humas_task_prompts WHERE task_code=$1 FOR UPDATE', [taskCode],
      );
      if (!current.rows[0]) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'AI_PROMPT_DEFAULT_NOT_MIGRATED' });
      }
      if (Number(current.rows[0].version) !== body.expectedVersion) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'AI_PROMPT_VERSION_CONFLICT' });
      }
      if (current.rows[0].prompt_text.trim() === body.prompt.trim()) {
        await client.query('ROLLBACK');
        return reply.code(409).send({ error: 'AI_PROMPT_UNCHANGED' });
      }
      await client.query(
        'INSERT INTO ai_humas_task_prompt_history(task_code,version,prompt_text,changed_by) VALUES($1,$2,$3,$4)',
        [taskCode,current.rows[0].version,current.rows[0].prompt_text,payload.sub],
      );
      const updated = await client.query(
        'UPDATE ai_humas_task_prompts SET prompt_text=$2,version=version+1,updated_by=$3,updated_at=now() WHERE task_code=$1 RETURNING task_code,version,updated_at',
        [taskCode,body.prompt.trim(),payload.sub],
      );
      await client.query('COMMIT');
      return { data: updated.rows[0], execution_ready: false };
    } catch {
      await client.query('ROLLBACK').catch(() => {});
      return reply.code(503).send({ error: 'AI_PROMPT_SAVE_FAILED' });
    } finally {
      client.release();
    }
  });

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
      return { data: rows, execution_ready: false, notice: 'Routes are configuration only. Generation remains on legacy provider paths until budget enforcement and token attribution are implemented.' };
    } catch {
      return reply.code(503).send({ error: 'AI_ROUTES_UNAVAILABLE' });
    }
  });

  app.get('/api/humas/ai/budget-status', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.code AS provider_code, b.id AS budget_id, b.limit_usd,
                COALESCE((SELECT SUM(CASE WHEN r.status='settled' THEN r.settled_usd
                                          WHEN r.status='reserved' THEN r.reserved_usd ELSE 0 END)
                          FROM ai_budget_reservations r WHERE r.budget_id=b.id),0) AS committed_usd
           FROM ai_providers p
           LEFT JOIN LATERAL (
             SELECT id, limit_usd FROM ai_provider_budgets
              WHERE provider_id=p.id AND enabled=TRUE
                AND CURRENT_DATE>=period_start AND CURRENT_DATE<period_end
              ORDER BY period_start DESC LIMIT 1
           ) b ON TRUE
          WHERE LOWER(p.code) IN ('openai','anthropic','claude')`,
      );
      return { data: rows.map(row => {
        const limit = row.budget_id == null ? null : Number(row.limit_usd);
        const committed = row.budget_id == null ? null : Number(row.committed_usd);
        const remaining = limit == null || committed == null ? null : Math.max(0, limit-committed);
        const ratio = limit != null && limit > 0 && committed != null ? committed/limit : null;
        return {
          provider_code: row.provider_code,
          status: limit == null ? 'not_configured' : !Number.isFinite(limit) || !Number.isFinite(committed) ? 'unavailable' : remaining === 0 ? 'exhausted' : ratio != null && ratio >= 0.8 ? 'near_limit' : 'available',
          remaining_budget_usd: remaining,
          warning: limit == null || remaining === 0 ? 'Anggaran AI tidak mencukupi. Silakan hubungi Admin untuk top up atau penyesuaian batas anggaran.' : ratio != null && ratio >= 0.8 ? 'Anggaran AI mendekati batas. Hubungi Admin sebelum menggunakan model berbayar.' : null,
        };
      }), notice: 'Status berdasarkan anggaran internal, bukan saldo kredit provider.' };
    } catch {
      return reply.code(503).send({ error: 'AI_BUDGET_STATUS_UNAVAILABLE' });
    }
  });

  // Configuration only. Runtime paid execution must still pass gateway budget reservation.
  app.get('/api/humas/ai/model-selections', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(`SELECT s.task_code, p.code AS provider_code, m.code AS model_code, s.updated_at
        FROM ai_humas_model_selections s JOIN ai_models m ON m.id=s.model_id
        JOIN ai_providers p ON p.id=m.provider_id
        WHERE s.task_code = ANY($1::text[]) ORDER BY s.task_code`, [HUMAS_AI_TASKS]);
      return { data: rows, execution_ready: false };
    } catch { return reply.code(503).send({ error: 'AI_MODEL_SELECTION_STORAGE_UNAVAILABLE' }); }
  });

  app.put('/api/humas/ai/model-selections/:taskCode', { preHandler: guard }, async (request, reply) => {
    const taskCode = (request.params as { taskCode?: string }).taskCode;
    const body = request.body as { providerCode?: unknown; modelCode?: unknown } | null;
    if (!taskCode || !(HUMAS_AI_TASKS as readonly string[]).includes(taskCode) ||
      typeof body?.providerCode !== 'string' || typeof body?.modelCode !== 'string' ||
      body.providerCode.length > 60 || body.modelCode.length > 120) {
      return reply.code(400).send({ error: 'AI_MODEL_SELECTION_INVALID' });
    }
    try {
      const token = request.cookies.access_token;
      if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      const payload = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof payload.sub !== 'string') return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
      const selected = await pool.query(`SELECT m.id FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id
        WHERE p.code=$1 AND m.code=$2 AND m.enabled=TRUE LIMIT 1`,
        [body.providerCode,body.modelCode]);
      if (!selected.rows[0]) return reply.code(409).send({ error: 'AI_MODEL_NOT_ENABLED' });
      const { rows } = await pool.query(`INSERT INTO ai_humas_model_selections(task_code,model_id,updated_by)
        VALUES($1,$2,$3) ON CONFLICT(task_code) DO UPDATE SET model_id=EXCLUDED.model_id,
        updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING task_code,updated_at`,
        [taskCode,selected.rows[0].id,payload.sub]);
      return { data: { ...rows[0], provider_code:body.providerCode,model_code:body.modelCode }, execution_ready:false };
    } catch { return reply.code(503).send({ error: 'AI_MODEL_SELECTION_SAVE_FAILED' }); }
  });

  app.get('/api/humas/ai/available-models', { preHandler: guard }, async (_request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT p.code AS provider_code, p.name AS provider_name,
                m.code AS model_code, m.name AS model_name, p.enabled AS provider_enabled,
                CASE WHEN LOWER(p.code) = 'gemini' AND m.capabilities->>'free_tier' = 'true' THEN 'free' WHEN LOWER(p.code) IN ('openai', 'anthropic', 'claude') THEN 'paid' ELSE 'unverified' END AS pricing_tier
           FROM ai_models m
           JOIN ai_providers p ON p.id = m.provider_id
          WHERE m.enabled = TRUE
          ORDER BY p.name, m.name`,
      );
      return { data: rows, tasks: HUMAS_AI_TASKS };
    } catch {
      // AI tables may not yet be migrated in some installations.
      return reply.code(503).send({ error: 'AI_CATALOG_UNAVAILABLE' });
    }
  });
}
