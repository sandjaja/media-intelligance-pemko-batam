import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { analyzeSocialRoutingV16 } from './social-v16-adapter.js';
import { clusterSocialConversations, persistSocialConversationClusters } from './social-conversation-clustering.js';
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

  const manager = [auth, requireWrite];

  const scopedOpd = (ctx: AuthorizationContext, requested?: string) =>
    hasPermission(ctx, 'platform.admin') || hasPermission(ctx, 'intelligence.read.all')
      ? (requested ?? null)
      : (ctx.opdId ?? null);

  const resolveOrganizationId = async (ctx: AuthorizationContext) => {
    if (ctx.opdId) {
      const r = await pool.query('SELECT organization_id FROM opd WHERE id=$1', [ctx.opdId]);
      if (r.rows[0]?.organization_id) return Number(r.rows[0].organization_id);
    }
    const r = await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2');
    return r.rowCount === 1 ? Number(r.rows[0].id) : 0;
  };

  app.get('/api/admin/social/:id/classification-keywords',{preHandler:manager},async(request,reply)=>{const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const mentionId=Number((request.params as any).id),q=String((request.query as any)?.q||'').trim();if(!Number.isInteger(mentionId)||mentionId<=0)return reply.code(400).send({error:'INVALID_MENTION_ID'});const params:any[]=[organizationId];let search='';if(q){params.push(`%${q}%`);search=` AND (k.keyword ILIKE $2 OR t.name ILIKE $2)`;}const rows=(await pool.query(`SELECT k.id keyword_id,k.keyword,kt.weight,t.id taxonomy_id,t.name taxonomy_name,(SELECT jsonb_agg(jsonb_build_object('opdId',ko.opd_id,'opdName',o.name,'role',ko.routing_role) ORDER BY CASE WHEN ko.routing_role='PRIMARY' THEN 0 ELSE 1 END,o.name) FROM keyword_opd ko JOIN opd o ON o.id=ko.opd_id AND o.active=true WHERE ko.keyword_id=k.id AND ko.active=true) routing FROM keywords k JOIN keyword_taxonomy kt ON kt.keyword_id=k.id AND kt.active=true JOIN taxonomy_categories t ON t.id=kt.category_id AND t.active=true WHERE k.organization_id=$1 AND k.active=true AND k.opd_id IS NULL AND k.district_id IS NULL ${search} ORDER BY kt.weight DESC,k.keyword LIMIT 80`,params)).rows;return{data:rows};});

  app.put('/api/admin/social/:id/classification-keyword',{preHandler:manager},async(request,reply)=>{const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const mentionId=Number((request.params as any).id),p=z.object({keywordId:z.number().int().positive(),reason:z.string().trim().max(1000).optional().default('')}).safeParse(request.body);if(!Number.isInteger(mentionId)||mentionId<=0||!p.success)return reply.code(400).send({error:'INVALID_REQUEST'});const actor=request.socialAuth!;const mention=(await pool.query(`SELECT id,title,content,source_kind,metadata,opd_id FROM social_mentions WHERE id=$1`,[mentionId])).rows[0];if(!mention)return reply.code(404).send({error:'MENTION_NOT_FOUND'});if(mention.source_kind!=='external')return reply.code(409).send({error:'EXTERNAL_SOCIAL_REQUIRED'});const valid=(await pool.query(`SELECT k.id,k.keyword,COUNT(*) FILTER(WHERE ko.routing_role='PRIMARY' AND ko.active=true AND o.active=true)::int primary_count FROM keywords k LEFT JOIN keyword_opd ko ON ko.keyword_id=k.id LEFT JOIN opd o ON o.id=ko.opd_id WHERE k.id=$1 AND k.organization_id=$2 AND k.active=true GROUP BY k.id,k.keyword`,[p.data.keywordId,organizationId])).rows[0];if(!valid||Number(valid.primary_count)!==1)return reply.code(400).send({error:'KEYWORD_REQUIRES_EXACTLY_ONE_PRIMARY_OPD'});const routing=await analyzeSocialRoutingV16(pool,{title:mention.title,content:mention.content,manualKeywordId:p.data.keywordId});if(routing.routingStatus!=='ROUTED'||!routing.primaryOpdId)return reply.code(409).send({error:'MANUAL_KEYWORD_DID_NOT_PRODUCE_PRIMARY_OPD'});const client=await pool.connect();try{await client.query('BEGIN');const metadata={...(mention.metadata||{}),v16Routing:routing,manualClassification:{locked:true,keywordId:p.data.keywordId,organizationId,keyword:valid.keyword,reason:p.data.reason||null,selectedBy:actor.id,selectedAt:new Date().toISOString()}};await client.query(`UPDATE social_mentions SET opd_id=$2,metadata=$3::jsonb,processing_status='classified',updated_at=NOW() WHERE id=$1`,[mentionId,routing.primaryOpdId,JSON.stringify(metadata)]);await client.query(`DELETE FROM social_mention_keywords WHERE mention_id=$1`,[mentionId]);await client.query(`INSERT INTO social_mention_keywords(mention_id,keyword_id,matched_text,match_count,confidence) VALUES($1,$2,$3,1,1) ON CONFLICT(mention_id,keyword_id) DO UPDATE SET matched_text=EXCLUDED.matched_text,match_count=1,confidence=1`,[mentionId,p.data.keywordId,valid.keyword]);await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOCIAL_CLASSIFICATION_KEYWORD_CORRECTED',$2)`,[actor.id,{mentionId:String(mentionId),before:{opdId:mention.opd_id},after:{opdId:routing.primaryOpdId},keywordId:p.data.keywordId,keyword:valid.keyword,reason:p.data.reason||null}]);await client.query('COMMIT');return{ok:true,data:{mentionId:String(mentionId),keywordId:p.data.keywordId,routing,locked:true}};}catch(e){await client.query('ROLLBACK');request.log.error({err:e,mentionId},'social classification correction failed');return reply.code(409).send({error:'CLASSIFICATION_CORRECTION_FAILED'});}finally{client.release();}});

  app.get('/api/social/mentions', { preHandler: auth }, async (request, reply) => {
    const parsed = z.object({
      platform: platformSchema.optional(),
      opdId: z.string().regex(/^\d+$/).optional(),
      keywordId: z.string().regex(/^\d+$/).optional(),
      sentiment: sentimentSchema.optional(),
      riskLevel: z.enum(['low','medium','high','critical']).optional(),
      sourceKind: z.enum(['external','owned']).default('external'),
      from: z.string().optional(),
      to: z.string().optional(),
      days: z.coerce.number().int().refine(v => [7,14,30].includes(v)).default(7),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_QUERY' });

    const params: unknown[] = [];
    const where: string[] = [`sm.source_kind='${parsed.data.sourceKind}'`];
    const bind = (value: unknown) => { params.push(value); return '$' + params.length; };
    const opdId = scopedOpd(request.socialAuth!, parsed.data.opdId);

    if (opdId) where.push(`sm.opd_id=${bind(opdId)}`);
    if (parsed.data.platform) where.push(`sm.platform=${bind(parsed.data.platform)}`);
    if (parsed.data.sentiment) where.push(`sm.sentiment=${bind(parsed.data.sentiment)}`);
    if (parsed.data.riskLevel) where.push(`sm.risk_level=${bind(parsed.data.riskLevel)}`);
    if (parsed.data.from) where.push(`sm.published_at >= ${bind(parsed.data.from)}`);
    else where.push(`COALESCE(sm.published_at,sm.captured_at) >= NOW() - (${bind(parsed.data.days)}::int * INTERVAL '1 day')`);
    if (parsed.data.to) where.push(`sm.published_at < ${bind(parsed.data.to)}`);
    if (parsed.data.keywordId) {
      const keywordParam=bind(parsed.data.keywordId);
      where.push(`EXISTS (SELECT 1 FROM social_mention_keywords smk WHERE smk.mention_id=sm.id AND smk.keyword_id=${keywordParam})`);
    }

    const filterSql='WHERE '+where.join(' AND ');
    const countParams=[...params];
    const countResult=await pool.query(`SELECT COUNT(*)::int total FROM social_mentions sm ${filterSql}`,countParams);
    const total=Number(countResult.rows[0]?.total||0);
    const limitParam=bind(parsed.data.limit);
    const offsetParam=bind((parsed.data.page-1)*parsed.data.limit);

    const { rows } = await pool.query(
      `SELECT sm.*,o.name opd_name,osa.account_name owned_account_name,osa.handle owned_account_handle
         FROM social_mentions sm
         LEFT JOIN opd o ON o.id=sm.opd_id
         LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
         ${filterSql}
         ORDER BY sm.risk_score DESC, sm.published_at DESC NULLS LAST, sm.captured_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return {
      data: rows,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total,
        totalPages: Math.max(1,Math.ceil(total/parsed.data.limit)),
      },
    };
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

  app.post('/api/social/conversation-clusters/incremental',{preHandler:manager},async(request,reply)=>{
    const body=z.object({days:z.coerce.number().int().refine(v=>[7,14,30].includes(v)).default(7)}).safeParse(request.body??{});
    if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
    return{ok:true,result:await persistSocialConversationClusters(pool,organizationId,body.data.days)};
  });

  app.post('/api/social/conversation-clusters/manual/move',{preHandler:manager},async(request,reply)=>{
    const body=z.object({mentionId:z.coerce.number().int().positive(),clusterId:z.coerce.number().int().positive(),reason:z.string().trim().max(500).optional()}).safeParse(request.body??{});
    if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
    const client=await pool.connect();try{await client.query('BEGIN');const cluster=(await client.query('SELECT id FROM social_conversation_clusters WHERE id=$1 AND organization_id=$2',[body.data.clusterId,organizationId])).rows[0];if(!cluster){await client.query('ROLLBACK');return reply.code(404).send({error:'CLUSTER_NOT_FOUND'});}await client.query('DELETE FROM social_conversation_manual_exclusions WHERE mention_id=$1',[body.data.mentionId]);await client.query('DELETE FROM social_conversation_cluster_members WHERE mention_id=$1',[body.data.mentionId]);await client.query(`INSERT INTO social_conversation_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'semantic','manual','MANUAL')`,[body.data.clusterId,body.data.mentionId]);await client.query('COMMIT');return{ok:true};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });

  app.post('/api/social/conversation-clusters/manual/remove',{preHandler:manager},async(request,reply)=>{
    const body=z.object({mentionId:z.coerce.number().int().positive(),reason:z.string().trim().max(500).optional()}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
    const client=await pool.connect();try{await client.query('BEGIN');await client.query('DELETE FROM social_conversation_cluster_members WHERE mention_id=$1',[body.data.mentionId]);await client.query(`INSERT INTO social_conversation_manual_exclusions(mention_id,organization_id,reason,excluded_by,excluded_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(mention_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,reason=EXCLUDED.reason,excluded_by=EXCLUDED.excluded_by,excluded_at=NOW()`,[body.data.mentionId,organizationId,body.data.reason??null,request.socialAuth!.id]);await client.query('COMMIT');return{ok:true};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });

  app.post('/api/social/conversation-clusters/manual/create',{preHandler:manager},async(request,reply)=>{
    const body=z.object({name:z.string().trim().min(2).max(160),mentionId:z.coerce.number().int().positive(),reason:z.string().trim().max(500).optional()}).safeParse(request.body??{});if(!body.success)return reply.code(400).send({error:'INVALID_REQUEST'});
    const organizationId=await resolveOrganizationId(request.socialAuth!);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const mention=(await pool.query(`SELECT id,metadata,COALESCE(published_at,captured_at) published_at FROM social_mentions WHERE id=$1`,[body.data.mentionId])).rows[0];if(!mention)return reply.code(404).send({error:'MENTION_NOT_FOUND'});const routing=mention.metadata?.v16Routing||{};
    const client=await pool.connect();try{await client.query('BEGIN');await client.query('DELETE FROM social_conversation_manual_exclusions WHERE mention_id=$1',[body.data.mentionId]);await client.query('DELETE FROM social_conversation_cluster_members WHERE mention_id=$1',[body.data.mentionId]);const ins=await client.query(`INSERT INTO social_conversation_clusters(organization_id,canonical_title,taxonomy_id,keyword_id,representative_mention_id,member_count,platform_count,first_published_at,last_published_at,engine_version,origin_mode) VALUES($1,$2,$3,$4,$5,1,1,$6,$6,'manual','MANUAL') RETURNING id`,[organizationId,body.data.name,routing.taxonomyId||null,routing.keywordId||null,body.data.mentionId,mention.published_at]);await client.query(`INSERT INTO social_conversation_cluster_members(cluster_id,mention_id,similarity_score,similarity_type,matched_by,assignment_mode) VALUES($1,$2,1,'representative','manual','MANUAL')`,[ins.rows[0].id,body.data.mentionId]);await client.query('COMMIT');return{ok:true,clusterId:ins.rows[0].id};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  });

  app.get('/api/social/conversation-insights', { preHandler: auth }, async (request, reply) => {
    const parsed=z.object({days:z.coerce.number().int().refine(v=>[7,14,30].includes(v)).default(7),platform:platformSchema.optional()}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const params:unknown[]=[parsed.data.days],where:string[]=["source_kind='external'","COALESCE(published_at,captured_at) >= NOW() - ($1::int * INTERVAL '1 day')"];
    if(parsed.data.platform){params.push(parsed.data.platform);where.push(`platform=$${params.length}`);}
    const filter='WHERE '+where.join(' AND ');
    const mentions=await pool.query(`SELECT id::text,platform,title,content,published_at,captured_at,sentiment,risk_level,risk_score,metadata FROM social_mentions ${filter} ORDER BY COALESCE(published_at,captured_at) ASC,id ASC`,params);
    const trends=await pool.query(`SELECT date_trunc('day',COALESCE(published_at,captured_at))::date day,COUNT(*)::int mentions,COUNT(*) FILTER(WHERE sentiment='positive')::int positive,COUNT(*) FILTER(WHERE sentiment='neutral')::int neutral,COUNT(*) FILTER(WHERE sentiment='negative')::int negative,COUNT(*) FILTER(WHERE risk_level IN ('high','critical'))::int high_risk FROM social_mentions ${filter} GROUP BY 1 ORDER BY 1`,params);
    const clusters=clusterSocialConversations(mentions.rows).slice(0,10).map(c=>({
      key:c.key,taxonomyId:c.taxonomyId,taxonomyName:c.taxonomyName,keywordId:c.keywordId,keyword:c.keyword,
      mentions:c.mentions.length,platforms:c.platforms,platformCount:c.platforms.length,negative:c.negative,highRisk:c.highRisk,
      representative:c.mentions[0]??null
    }));
    return{trends:trends.rows,clusters};
  });

  app.get('/api/social/summary', { preHandler: auth }, async (request, reply) => {
    const parsed=z.object({opdId:z.string().regex(/^\d+$/).optional(),platform:platformSchema.optional(),sentiment:sentimentSchema.optional(),riskLevel:z.enum(['low','medium','high','critical']).optional(),from:z.string().optional(),to:z.string().optional(),days:z.coerce.number().int().refine(v=>[7,14,30].includes(v)).default(7)}).safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_QUERY'});
    const params:unknown[]=[],where:string[]=[`source_kind='external'`];const opdId=scopedOpd(request.socialAuth!,parsed.data.opdId);
    const bind=(value:unknown)=>{params.push(value);return '$'+params.length;};
    if(opdId)where.push(`opd_id=${bind(opdId)}`);
    if(parsed.data.platform)where.push(`platform=${bind(parsed.data.platform)}`);
    if(parsed.data.sentiment)where.push(`sentiment=${bind(parsed.data.sentiment)}`);
    if(parsed.data.riskLevel)where.push(`risk_level=${bind(parsed.data.riskLevel)}`);
    if(parsed.data.from)where.push(`published_at >= ${bind(parsed.data.from)}`);
    else where.push(`COALESCE(published_at,captured_at) >= NOW() - (${bind(parsed.data.days)}::int * INTERVAL '1 day')`);
    if(parsed.data.to)where.push(`published_at < ${bind(parsed.data.to)}`);
    const filter=where.length?'WHERE '+where.join(' AND '):'';
    const metrics=await pool.query(`SELECT COUNT(*)::int total_mentions,COUNT(*) FILTER(WHERE sentiment='positive')::int positive,COUNT(*) FILTER(WHERE sentiment='neutral')::int neutral,COUNT(*) FILTER(WHERE sentiment='negative')::int negative,COUNT(*) FILTER(WHERE risk_level IN ('high','critical'))::int high_risk,COUNT(*) FILTER(WHERE COALESCE(metadata->'v16Routing'->>'routingStatus','UNROUTED')<>'ROUTED')::int unmapped,COALESCE(ROUND(AVG(risk_score),2),0) avg_risk,COALESCE(ROUND(AVG(influence_score),2),0) avg_influence FROM social_mentions ${filter}`,params);
    const byPlatform=await pool.query(`SELECT platform,COUNT(*)::int mentions,COUNT(*) FILTER(WHERE sentiment='negative')::int negative FROM social_mentions ${filter} GROUP BY platform ORDER BY mentions DESC`,params);
    return {metrics:metrics.rows[0],byPlatform:byPlatform.rows};
  });
}
