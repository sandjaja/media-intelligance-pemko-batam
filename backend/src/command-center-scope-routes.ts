import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

type ScopeUser = { id: string; role: 'admin'|'operator'|'viewer'; opdId: string | null };
declare module 'fastify' { interface FastifyRequest { scopeUser?: ScopeUser } }

export async function registerCommandCenterScopeRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const d = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof d.sub !== 'string' || !['admin','operator','viewer'].includes(String(d.role))) throw new Error('invalid');
      request.scopeUser = { id: d.sub, role: d.role as ScopeUser['role'], opdId: d.opdId ? String(d.opdId) : null };
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  app.get('/api/districts', { preHandler: auth }, async () => {
    const { rows } = await pool.query(`SELECT id,code,name FROM districts WHERE active=true ORDER BY name ASC`);
    return { data: rows };
  });

  app.get('/api/command-center/scope', { preHandler: auth }, async (request, reply) => {
    const parsed = z.object({
      opdId: z.string().regex(/^\d+$/).optional(),
      districtId: z.string().regex(/^\d+$/).optional(),
      articleLimit: z.coerce.number().int().min(1).max(100).default(25),
      highlightLimit: z.coerce.number().int().min(1).max(50).default(10),
      alertLimit: z.coerce.number().int().min(1).max(100).default(25),
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });

    const user = request.scopeUser;
    const opdId = user?.role === 'admin' ? (parsed.data.opdId ?? null) : (user?.opdId ?? null);
    const districtId = parsed.data.districtId ?? null;
    const params: unknown[] = [];
    const where: string[] = [];
    if (opdId) { params.push(opdId); where.push(`a.opd_id=$${params.length}`); }
    if (districtId) { params.push(districtId); where.push(`a.district_id=$${params.length}`); }
    const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const metricResult = await pool.query(
      `SELECT COUNT(*)::int total_articles,
              COUNT(*) FILTER(WHERE is_highlight)::int highlights,
              COUNT(*) FILTER(WHERE sentiment='negative')::int negative,
              COUNT(*) FILTER(WHERE risk_level IN ('high','critical'))::int critical,
              COUNT(*) FILTER(WHERE risk_level='critical')::int critical_alerts,
              COALESCE(ROUND(AVG(importance_score)),0)::int momentum
         FROM articles a ${filterSql}`,
      params,
    );
    const sourcesResult = await pool.query(`SELECT COUNT(*)::int count FROM media_sources WHERE active=true`);

    const articleParams = [...params, parsed.data.articleLimit];
    const articles = await pool.query(
      `SELECT a.id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,
              a.risk_score,a.risk_level,a.is_highlight,a.summary,a.opd_id,a.district_id,
              ms.name source_name,o.name opd_name,d.name district_name
         FROM articles a
         LEFT JOIN media_sources ms ON ms.id=a.source_id
         LEFT JOIN opd o ON o.id=a.opd_id
         LEFT JOIN districts d ON d.id=a.district_id
         ${filterSql}
         ORDER BY a.importance_score DESC,a.published_at DESC NULLS LAST
         LIMIT $${articleParams.length}`,
      articleParams,
    );

    const highlightWhere = [...where, 'a.is_highlight=true'];
    const highlightParams = [...params, parsed.data.highlightLimit];
    const highlights = await pool.query(
      `SELECT a.id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,
              a.risk_score,a.risk_level,a.summary,a.opd_id,a.district_id,
              ms.name source_name,o.name opd_name,d.name district_name
         FROM articles a
         LEFT JOIN media_sources ms ON ms.id=a.source_id
         LEFT JOIN opd o ON o.id=a.opd_id
         LEFT JOIN districts d ON d.id=a.district_id
         WHERE ${highlightWhere.join(' AND ')}
         ORDER BY a.risk_score DESC,a.importance_score DESC,a.published_at DESC NULLS LAST
         LIMIT $${highlightParams.length}`,
      highlightParams,
    );

    const alertParams: unknown[] = ['open'];
    const alertWhere: string[] = ['aa.status=$1'];
    if (opdId) { alertParams.push(opdId); alertWhere.push(`a.opd_id=$${alertParams.length}`); }
    if (districtId) { alertParams.push(districtId); alertWhere.push(`a.district_id=$${alertParams.length}`); }
    alertParams.push(parsed.data.alertLimit);
    const alerts = await pool.query(
      `SELECT aa.id,aa.article_id,aa.alert_type,aa.severity,aa.reason,aa.status,aa.created_at,
              a.title,a.url,a.published_at,a.risk_score,a.risk_level,a.opd_id,a.district_id,
              ms.name source_name,o.name opd_name,d.name district_name
         FROM article_alerts aa
         JOIN articles a ON a.id=aa.article_id
         LEFT JOIN media_sources ms ON ms.id=a.source_id
         LEFT JOIN opd o ON o.id=a.opd_id
         LEFT JOIN districts d ON d.id=a.district_id
         WHERE ${alertWhere.join(' AND ')}
         ORDER BY aa.created_at DESC
         LIMIT $${alertParams.length}`,
      alertParams,
    );

    return {
      scope: { opdId, districtId },
      metrics: { ...metricResult.rows[0], sources: Number(sourcesResult.rows[0]?.count || 0) },
      articles: articles.rows,
      highlights: highlights.rows,
      alerts: alerts.rows,
    };
  });
}
