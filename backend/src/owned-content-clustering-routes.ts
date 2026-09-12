import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';
import { collectOwnedWebsiteAccount } from './website-collector.js';

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
    const ctx=request.ownedClusterAuth!;
    if(!hasPermission(ctx,'intelligence.write')&&!hasPermission(ctx,'platform.admin')) return reply.code(403).send({error:'FORBIDDEN'});
  };

  app.post('/api/social/owned-clusters/rebuild',{preHandler:[auth,requireWrite]},async(request)=>{
    const ctx=request.ownedClusterAuth!;
    const canReadAll=hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all');
    const params:unknown[]=[];
    let scope='';
    if(!canReadAll){
      if(!ctx.opdId) scope=' AND 1=0';
      else { params.push(ctx.opdId); scope=` AND opd_id=$${params.length}`; }
    }
    const accounts=(await pool.query(`SELECT id,account_name FROM owned_social_accounts WHERE active=true AND platform='website'${scope} ORDER BY is_primary_source DESC,source_priority DESC,id ASC`,params)).rows;
    const websiteSync:any[]=[];
    for(const account of accounts){
      try{
        const sync=await collectOwnedWebsiteAccount(pool,Number(account.id));
        websiteSync.push({accountId:Number(account.id),accountName:account.account_name,ok:true,...sync});
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        websiteSync.push({accountId:Number(account.id),accountName:account.account_name,ok:false,error:message});
        app.log.warn({err:error,accountId:account.id},'Owned website refresh failed');
      }
    }
    const result=await rebuildOwnedContentClusters(pool);
    const payload={...result,websiteSync};
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_CONTENT_CLUSTER_REBUILD',$2::jsonb)`,[ctx.id,JSON.stringify(payload)]);
    return{data:payload};
  });

  app.get('/api/social/owned-clusters',{preHandler:auth},async()=>{
    const{rows}=await pool.query(`SELECT occ.id,occ.canonical_title,occ.representative_mention_id,occ.member_count,occ.channel_count,occ.first_published_at,occ.last_published_at,COALESCE(json_agg(json_build_object('mentionId',sm.id,'title',sm.title,'url',sm.canonical_url,'platform',sm.platform,'accountId',sm.owned_account_id,'accountName',osa.account_name,'publishedAt',sm.published_at,'similarityScore',ocm.similarity_score,'similarityType',ocm.similarity_type,'memberRole',CASE WHEN sm.id=occ.representative_mention_id THEN 'original' WHEN ocm.similarity_type='identical' THEN 'republication' WHEN ocm.similarity_type='adapted' THEN 'adaptation' ELSE 'member' END) ORDER BY sm.published_at DESC NULLS LAST,sm.id DESC),'[]'::json) members FROM owned_content_clusters occ LEFT JOIN owned_content_cluster_members ocm ON ocm.cluster_id=occ.id LEFT JOIN social_mentions sm ON sm.id=ocm.mention_id LEFT JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id GROUP BY occ.id ORDER BY occ.last_published_at DESC NULLS LAST,occ.first_published_at DESC NULLS LAST,occ.id DESC`);
    return{data:rows};
  });
}
