import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';

declare module 'fastify' { interface FastifyRequest { ownedClusterAuth?: AuthorizationContext } }

export async function registerOwnedContentClusteringRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const ctx = await loadAuthorizationContext(pool, decoded.sub);
      if (!ctx?.active) return reply.code(403).send({ error: 'ACCOUNT_INACTIVE' });
      request.ownedClusterAuth = ctx;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };
  const requireWrite = async (request: FastifyRequest, reply: any) => {
    const ctx = request.ownedClusterAuth!;
    if (!hasPermission(ctx, 'intelligence.write') && !hasPermission(ctx, 'platform.admin')) {
      return reply.code(403).send({ error: 'FORBIDDEN' });
    }
  };

  app.post('/api/social/owned-clusters/rebuild', { preHandler: [auth, requireWrite] }, async (request) => {
    const result = await rebuildOwnedContentClusters(pool);
    const ctx = request.ownedClusterAuth!;
    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_CONTENT_CLUSTER_REBUILD',$2::jsonb)`,
      [ctx.id, JSON.stringify(result)],
    );
    return { data: result };
  });

  app.get('/api/social/owned-clusters', { preHandler: auth }, async () => {
    const { rows } = await pool.query(
      `SELECT occ.id,occ.canonical_title,occ.representative_mention_id,occ.member_count,occ.channel_count,
              occ.first_published_at,occ.last_published_at,
              COALESCE(json_agg(json_build_object(
                'mentionId',sm.id,
                'title',sm.title,
                'url',sm.canonical_url,
                'platform',sm.platform,
                'accountId',sm.owned_account_id,
                'accountName',osa.account_name,
                'publishedAt',sm.published_at,
                'similarityScore',ocm.similarity_score,
                'similarityType',ocm.similarity_type
              ) ORDER BY sm.published_at DESC NULLS LAST),'[]'::json) members
         FROM owned_content_clusters occ
         LEFT JOIN owned_content_cluster_members ocm ON ocm.cluster_id=occ.id
         LEFT JOIN social_mentions sm ON sm.id=ocm.mention_id
         LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id
        GROUP BY occ.id
        ORDER BY occ.channel_count DESC,occ.member_count DESC,occ.last_published_at DESC NULLS LAST,occ.id DESC`,
    );
    return { data: rows };
  });
}
