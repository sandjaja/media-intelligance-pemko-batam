import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { socialAuth?: AuthorizationContext } }

const platformSchema = z.enum(['instagram','facebook','tiktok','x','youtube','website','threads','other']);
const sentimentSchema = z.enum(['positive','neutral','negative']);

export async function registerSocialIntelligenceRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const ctx = await loadAuthorizationContext(pool, decoded.sub);
      if (!ctx?.active) return reply.code(403).send({ error: 'ACCOUNT_INACTIVE' });
      request.socialAuth = ctx;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const requireWrite = async (request: FastifyRequest, reply: any) => {
    const ctx = request.socialAuth!;
    if (!hasPermission(ctx, 'intelligence.write') && !hasPermission(ctx, 'platform.admin')) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };

  const scopedOpd = (ctx: AuthorizationContext, requested?: string) =>
    hasPermission(ctx, 'platform.admin') || hasPermission(ctx, 'intelligence.read.all')
      ? (requested ?? null)
      : (ctx.opdId ?? null);

  app.get('/api/social/mentions', { preHandler: auth }, async (request, reply) => {
    const parsed = z.object({
      platform: platformSchema.optional(),
      opdId: z.string().regex(/^\d+$/).optional(),
      keywordId: z.string().regex(/^\d+$/).optional(),
      sentiment: sentimentSchema.optional(),
      riskLevel: z.enum(['low','medium','high','critical']).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });

    const params: unknown[] = [];
    const where: string[] = [];
    const opdId = scopedOpd(request.socialAuth!, parsed.data.opdId);
    if (opdId) { params.push(opdId); where.push(`sm.opd_id=$${params.length}`); }
    if (parsed.data.platform) { params.push(parsed.data.platform); where.push(`sm.platform=$${params.length}`); }
    if (parsed.data.sentiment) { params.push(parsed.data.sentiment); where.push(`sm.sentiment=$${params.length}`); }
    if (parsed.data.riskLevel) { params.push(parsed.data.riskLevel); where.push(`sm.risk_level=$${params.length}`); }
    if (parsed.data.from) { params.push(parsed.data.from); where.push(`sm.published_at >= $${params.length}`); }
    if (parsed.data.to) { params.push(parsed.data.to); where.push(`sm.published_at < $${params.length}`); }
    if (parsed.data.keywordId) {
      params.push(parsed.data.keywordId);
      where.push(`EXISTS (SELECT 1 FROM social_mention_keywords smk WHERE smk.mention_id=sm.id AND smk.keyword_id=$${params.length})`);
    }
    params.push(parsed.data.limit);
    const { rows } = await pool.query(
      `SELECT sm.*,o.name opd_name,osa.account_name owned_account_name,osa.handle owned_account_handle
         FROM social_mentions sm
         LEFT JOIN opd o ON o.id=sm.opd_id
         LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY sm.risk_score DESC, sm.published_at DESC NULLS LAST, sm.captured_at DESC
         LIMIT $${params.length}`,
      params,
    );
    return { data: rows };
  });

  app.post('/api/social/mentions', { preHandler: [auth, requireWrite] }, async (request, reply) => {
    const parsed = z.object({
      platform: platformSchema,
      externalId: z.string().max(300).optional().nullable(),
      contentType: z.enum(['post','comment','reply','video','short','reel','story','live','article','other']).default('post'),
      sourceKind: z.enum(['owned','external','manual']).default('manual'),
      ownedAccountId: z.coerce.number().int().positive().optional().nullable(),
      opdId: z.coerce.number().int().positive().optional().nullable(),
      authorName: z.string().max(300).optional().nullable(),
      authorHandle: z.string().max(300).optional().nullable(),
      authorProfileUrl: z.string().url().max(2000).optional().nullable(),
      canonicalUrl: z.string().url().max(2000).optional().nullable(),
      title: z.string().max(1000).optional().nullable(),
      content: z.string().max(100000).optional().nullable(),
      language: z.string().max(20).optional().nullable(),
      publishedAt: z.string().optional().nullable(),
      sentiment: sentimentSchema.optional().nullable(),
      sentimentScore: z.coerce.number().min(-1).max(1).optional().nullable(),
      importanceScore: z.coerce.number().min(0).max(100).default(0),
      influenceScore: z.coerce.number().min(0).max(100).default(0),
      riskScore: z.coerce.number().min(0).max(100).default(0),
      riskLevel: z.enum(['low','medium','high','critical']).default('low'),
      districtId: z.coerce.number().int().positive().optional().nullable(),
      villageId: z.coerce.number().int().positive().optional().nullable(),
      locationId: z.coerce.number().int().positive().optional().nullable(),
      contentHash: z.string().max(256).optional().nullable(),
      collector: z.string().max(100).optional().nullable(),
      rawPayload: z.unknown().optional(),
      metadata: z.unknown().optional(),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REQUEST', details: parsed.error.flatten() });

    const ctx = request.socialAuth!;
    const requestedOpd = parsed.data.opdId == null ? undefined : String(parsed.data.opdId);
    const scoped = scopedOpd(ctx, requestedOpd);
    const opdId = scoped == null ? null : Number(scoped);
    const d = parsed.data;
    const { rows } = await pool.query(
      `INSERT INTO social_mentions(platform,external_id,content_type,source_kind,owned_account_id,opd_id,author_name,author_handle,author_profile_url,canonical_url,title,content,language,published_at,sentiment,sentiment_score,importance_score,influence_score,risk_score,risk_level,location_id,district_id,village_id,content_hash,collector,raw_payload,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27::jsonb)
       ON CONFLICT (platform,external_id) WHERE external_id IS NOT NULL DO UPDATE SET
         content_type=EXCLUDED.content_type,source_kind=EXCLUDED.source_kind,owned_account_id=EXCLUDED.owned_account_id,opd_id=EXCLUDED.opd_id,author_name=EXCLUDED.author_name,author_handle=EXCLUDED.author_handle,author_profile_url=EXCLUDED.author_profile_url,canonical_url=EXCLUDED.canonical_url,title=EXCLUDED.title,content=EXCLUDED.content,language=EXCLUDED.language,published_at=EXCLUDED.published_at,sentiment=EXCLUDED.sentiment,sentiment_score=EXCLUDED.sentiment_score,importance_score=EXCLUDED.importance_score,influence_score=EXCLUDED.influence_score,risk_score=EXCLUDED.risk_score,risk_level=EXCLUDED.risk_level,location_id=EXCLUDED.location_id,district_id=EXCLUDED.district_id,village_id=EXCLUDED.village_id,content_hash=COALESCE(EXCLUDED.content_hash,social_mentions.content_hash),collector=EXCLUDED.collector,raw_payload=EXCLUDED.raw_payload,metadata=EXCLUDED.metadata,updated_at=now()
       RETURNING *`,
      [d.platform,d.externalId??null,d.contentType,d.sourceKind,d.ownedAccountId??null,opdId,d.authorName??null,d.authorHandle??null,d.authorProfileUrl??null,d.canonicalUrl??null,d.title??null,d.content??null,d.language??null,d.publishedAt??null,d.sentiment??null,d.sentimentScore??null,d.importanceScore,d.influenceScore,d.riskScore,d.riskLevel,d.locationId??null,d.districtId??null,d.villageId??null,d.contentHash??null,d.collector??null,JSON.stringify(d.rawPayload??{}),JSON.stringify(d.metadata??{})],
    );
    return reply.code(201).send({ data: rows[0] });
  });

  app.post('/api/social/mentions/:id/keywords', { preHandler: [auth, requireWrite] }, async (request, reply) => {
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body = z.object({ keywordId: z.coerce.number().int().positive(), matchedText: z.string().max(1000).optional().nullable(), matchCount: z.coerce.number().int().min(1).default(1), confidence: z.coerce.number().min(0).max(1).default(1) }).safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    const { rows } = await pool.query(`INSERT INTO social_mention_keywords(mention_id,keyword_id,matched_text,match_count,confidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mention_id,keyword_id) DO UPDATE SET matched_text=EXCLUDED.matched_text,match_count=EXCLUDED.match_count,confidence=EXCLUDED.confidence RETURNING *`, [id.data,body.data.keywordId,body.data.matchedText??null,body.data.matchCount,body.data.confidence]);
    return { data: rows[0] };
  });

  app.post('/api/social/mentions/:id/issues', { preHandler: [auth, requireWrite] }, async (request, reply) => {
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body = z.object({ issueId: z.coerce.number().int().positive(), relevanceScore: z.coerce.number().min(0).max(100).default(0), linkageSource: z.enum(['rule','ai','manual']).default('manual') }).safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    const { rows } = await pool.query(`INSERT INTO social_mention_issues(mention_id,issue_id,relevance_score,linkage_source) VALUES($1,$2,$3,$4) ON CONFLICT(mention_id,issue_id) DO UPDATE SET relevance_score=EXCLUDED.relevance_score,linkage_source=EXCLUDED.linkage_source RETURNING *`, [id.data,body.data.issueId,body.data.relevanceScore,body.data.linkageSource]);
    return { data: rows[0] };
  });

  app.post('/api/social/accounts/:id/metrics', { preHandler: [auth, requireWrite] }, async (request, reply) => {
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body = z.object({
      measuredAt: z.string().optional(), followers:z.coerce.number().int().min(0).optional().nullable(), following:z.coerce.number().int().min(0).optional().nullable(), subscribers:z.coerce.number().int().min(0).optional().nullable(), totalPosts:z.coerce.number().int().min(0).optional().nullable(), reach:z.coerce.number().int().min(0).optional().nullable(), impressions:z.coerce.number().int().min(0).optional().nullable(), profileViews:z.coerce.number().int().min(0).optional().nullable(), videoViews:z.coerce.number().int().min(0).optional().nullable(), likes:z.coerce.number().int().min(0).optional().nullable(), comments:z.coerce.number().int().min(0).optional().nullable(), shares:z.coerce.number().int().min(0).optional().nullable(), saves:z.coerce.number().int().min(0).optional().nullable(), clicks:z.coerce.number().int().min(0).optional().nullable(), engagementCount:z.coerce.number().int().min(0).optional().nullable(), engagementRate:z.coerce.number().min(0).optional().nullable(), dataScope:z.enum(['snapshot','daily','weekly','monthly']).default('snapshot'), source:z.string().max(100).optional().nullable(), rawPayload:z.unknown().optional()
    }).safeParse(request.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: 'INVALID_REQUEST' });
    const d=body.data;
    const measuredAt=d.measuredAt??new Date().toISOString();
    const {rows}=await pool.query(`INSERT INTO owned_social_account_metrics(account_id,measured_at,followers,following,subscribers,total_posts,reach,impressions,profile_views,video_views,likes,comments,shares,saves,clicks,engagement_count,engagement_rate,data_scope,source,raw_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb) ON CONFLICT(account_id,measured_at,data_scope) DO UPDATE SET followers=EXCLUDED.followers,following=EXCLUDED.following,subscribers=EXCLUDED.subscribers,total_posts=EXCLUDED.total_posts,reach=EXCLUDED.reach,impressions=EXCLUDED.impressions,profile_views=EXCLUDED.profile_views,video_views=EXCLUDED.video_views,likes=EXCLUDED.likes,comments=EXCLUDED.comments,shares=EXCLUDED.shares,saves=EXCLUDED.saves,clicks=EXCLUDED.clicks,engagement_count=EXCLUDED.engagement_count,engagement_rate=EXCLUDED.engagement_rate,source=EXCLUDED.source,raw_payload=EXCLUDED.raw_payload RETURNING *`,[id.data,measuredAt,d.followers??null,d.following??null,d.subscribers??null,d.totalPosts??null,d.reach??null,d.impressions??null,d.profileViews??null,d.videoViews??null,d.likes??null,d.comments??null,d.shares??null,d.saves??null,d.clicks??null,d.engagementCount??null,d.engagementRate??null,d.dataScope,d.source??null,JSON.stringify(d.rawPayload??{})]);
    return reply.code(201).send({data:rows[0]});
  });

  app.post('/api/social/mentions/:id/metrics', { preHandler: [auth, requireWrite] }, async (request, reply) => {
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);
    const body=z.object({ measuredAt:z.string().optional(), views:z.coerce.number().int().min(0).optional().nullable(), reach:z.coerce.number().int().min(0).optional().nullable(), impressions:z.coerce.number().int().min(0).optional().nullable(), likes:z.coerce.number().int().min(0).optional().nullable(), comments:z.coerce.number().int().min(0).optional().nullable(), shares:z.coerce.number().int().min(0).optional().nullable(), saves:z.coerce.number().int().min(0).optional().nullable(), clicks:z.coerce.number().int().min(0).optional().nullable(), reposts:z.coerce.number().int().min(0).optional().nullable(), engagementCount:z.coerce.number().int().min(0).optional().nullable(), engagementRate:z.coerce.number().min(0).optional().nullable(), source:z.string().max(100).optional().nullable(), rawPayload:z.unknown().optional() }).safeParse(request.body);
    if(!id.success||!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const d=body.data,measuredAt=d.measuredAt??new Date().toISOString();
    const {rows}=await pool.query(`INSERT INTO social_post_metrics(mention_id,measured_at,views,reach,impressions,likes,comments,shares,saves,clicks,reposts,engagement_count,engagement_rate,source,raw_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb) ON CONFLICT(mention_id,measured_at) DO UPDATE SET views=EXCLUDED.views,reach=EXCLUDED.reach,impressions=EXCLUDED.impressions,likes=EXCLUDED.likes,comments=EXCLUDED.comments,shares=EXCLUDED.shares,saves=EXCLUDED.saves,clicks=EXCLUDED.clicks,reposts=EXCLUDED.reposts,engagement_count=EXCLUDED.engagement_count,engagement_rate=EXCLUDED.engagement_rate,source=EXCLUDED.source,raw_payload=EXCLUDED.raw_payload RETURNING *`,[id.data,measuredAt,d.views??null,d.reach??null,d.impressions??null,d.likes??null,d.comments??null,d.shares??null,d.saves??null,d.clicks??null,d.reposts??null,d.engagementCount??null,d.engagementRate??null,d.source??null,JSON.stringify(d.rawPayload??{})]);
    return reply.code(201).send({data:rows[0]});
  });

  app.get('/api/social/summary', { preHandler: auth }, async (request, reply) => {
    const parsed=z.object({opdId:z.string().regex(/^\d+$/).optional(),from:z.string().optional(),to:z.string().optional()}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const params:unknown[]=[],where:string[]=[];const opdId=scopedOpd(request.socialAuth!,parsed.data.opdId);
    if(opdId){params.push(opdId);where.push(`opd_id=$${params.length}`)}
    if(parsed.data.from){params.push(parsed.data.from);where.push(`published_at >= $${params.length}`)}
    if(parsed.data.to){params.push(parsed.data.to);where.push(`published_at < $${params.length}`)}
    const filter=where.length?'WHERE '+where.join(' AND '):'';
    const metrics=await pool.query(`SELECT COUNT(*)::int total_mentions,COUNT(*) FILTER(WHERE sentiment='positive')::int positive,COUNT(*) FILTER(WHERE sentiment='neutral')::int neutral,COUNT(*) FILTER(WHERE sentiment='negative')::int negative,COUNT(*) FILTER(WHERE risk_level IN ('high','critical'))::int high_risk,COALESCE(ROUND(AVG(risk_score),2),0) avg_risk,COALESCE(ROUND(AVG(influence_score),2),0) avg_influence FROM social_mentions ${filter}`,params);
    const byPlatform=await pool.query(`SELECT platform,COUNT(*)::int mentions,COUNT(*) FILTER(WHERE sentiment='negative')::int negative FROM social_mentions ${filter} GROUP BY platform ORDER BY mentions DESC`,params);
    return {metrics:metrics.rows[0],byPlatform:byPlatform.rows};
  });
}
