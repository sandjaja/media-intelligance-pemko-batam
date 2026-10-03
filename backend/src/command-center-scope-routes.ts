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


  app.get('/api/command-center/trusted-evidence', { preHandler: auth }, async (request, reply) => {
    const parsed=z.object({opdId:z.string().regex(/^\\d+$/).optional(),districtId:z.string().regex(/^\\d+$/).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const user=request.scopeUser,opdId=user?.role==='admin'?(parsed.data.opdId??null):(user?.opdId??null),districtId=parsed.data.districtId??null;
    const params:unknown[]=[];const bind=(v:unknown)=>{params.push(v);return ', { preHandler: auth }, async (request, reply) => {
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
+params.length};
    const op=opdId?bind(opdId):null,dist=districtId?bind(districtId):null;
    const onlineScope=[op?`a.opd_id=${op}`:'',dist?`a.district_id=${dist}`:''].filter(Boolean).join(' AND ');
    const printScope=[op?`pa.opd_id=${op}`:'',dist?`pa.district_id=${dist}`:''].filter(Boolean).join(' AND ');
    const socialScope=[op?`sm.opd_id=${op}`:'',dist?`sm.district_id=${dist}`:''].filter(Boolean).join(' AND ');
    const limit=bind(parsed.data.limit);
    const sql=`
      WITH trusted AS (
       SELECT 'online'::text source_type,a.id,a.title,a.summary::text summary,a.url::text url,a.published_at,
        a.sentiment,a.risk_score::float,a.risk_level::text,a.importance_score::float,a.impact_score::float,ms.name::text source_name,a.opd_id,a.district_id
       FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id
       WHERE a.news_classification='UTAMA' AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0
        AND (SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED'
        ${onlineScope?' AND '+onlineScope:''}
       UNION ALL
       SELECT 'print',pa.id,pa.title,pa.summary::text,NULL::text,pe.edition_date::timestamptz,pa.sentiment,pa.risk_score::float,
        COALESCE(NULLIF(pa.ai_metadata->'intelligence'->>'riskLevel',''),CASE WHEN pa.risk_score>=80 THEN 'critical' WHEN pa.risk_score>=60 THEN 'high' WHEN pa.risk_score>=35 THEN 'medium' ELSE 'low' END),
        pa.importance_score::float,NULLIF(pa.ai_metadata->'intelligence'->>'impactScore','')::float,ms.name::text,pa.opd_id,pa.district_id
       FROM print_articles pa JOIN print_editions pe ON pe.id=pa.edition_id JOIN media_sources ms ON ms.id=pe.source_id
       WHERE lower(pa.status)='analyzed' AND pa.opd_id IS NOT NULL AND pa.ai_metadata->'v16Routing'->>'routingStatus'='ROUTED'
        AND COALESCE(pa.ai_metadata->'v16Routing'->>'keywordId','')<>'' AND pa.ai_metadata->'v16Routing'->>'keywordVerification'='ACCEPTED'
        AND pa.ai_metadata->'intelligence'->>'riskStatus'='FINAL' AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0
        ${printScope?' AND '+printScope:''}
       UNION ALL
       SELECT CASE WHEN sm.source_kind='owned' THEN 'owned' ELSE 'social' END,sm.id,COALESCE(sm.title,left(sm.content,240)),left(sm.content,1200),sm.canonical_url,
        COALESCE(sm.published_at,sm.captured_at),sm.sentiment,sm.risk_score::float,sm.risk_level::text,sm.importance_score::float,sm.influence_score::float,
        COALESCE(osa.account_name,sm.author_name,sm.platform)::text,sm.opd_id,sm.district_id
       FROM social_mentions sm LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
       WHERE sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0 AND (
        (sm.source_kind='external' AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED'
         AND sm.opd_id IS NOT NULL AND (sm.metadata->'socialVerification'->>'status'='LOCKED' OR sm.metadata->'manualClassification'->>'locked'='true')
         AND sm.metadata->'intelligence'->>'riskStatus'='FINAL')
        OR
        (sm.source_kind='owned' AND sm.curation_status='approved' AND sm.metadata->'v16Routing'->>'verificationStatus'='LOCKED'
         AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND sm.metadata->'intelligence'->>'riskStatus'='FINAL')
       ) ${socialScope?' AND '+socialScope:''}
      )
      SELECT *,COUNT(*) OVER()::int trusted_total,COUNT(*) FILTER(WHERE sentiment='negative') OVER()::int trusted_negative,
       COUNT(*) FILTER(WHERE risk_level IN ('high','critical')) OVER()::int trusted_high
      FROM trusted ORDER BY (COALESCE(risk_score,0)*.6+COALESCE(impact_score,0)*.4) DESC,published_at DESC NULLS LAST LIMIT ${limit}`;
    const {rows}=await pool.query(sql,params);
    const totals=rows[0]?{total:Number(rows[0].trusted_total||0),negative:Number(rows[0].trusted_negative||0),high:Number(rows[0].trusted_high||0)}:{total:0,negative:0,high:0};
    return{data:rows.map(({trusted_total,trusted_negative,trusted_high,...x}:any)=>x),metrics:totals,scope:{opdId,districtId},policy:'FINAL_LOCKED_ANALYZED_ONLY'};
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
