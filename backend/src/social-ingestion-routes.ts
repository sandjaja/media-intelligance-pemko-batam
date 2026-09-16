import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { ingestSocialBatch, type SocialCandidate } from './social-collector.js';
import { collectOwnedWebsiteAccount } from './website-collector.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';

declare module 'fastify' { interface FastifyRequest { socialIngestAuth?: AuthorizationContext } }

const platformSchema=z.enum(['instagram','facebook','tiktok','x','youtube','website','threads','other']);
const contentTypeSchema=z.enum(['post','comment','reply','video','short','reel','story','live','article','other']);

export async function registerSocialIngestionRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,d.sub);
      if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
      request.socialIngestAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const requireWrite=async(request:FastifyRequest,reply:any)=>{
    const ctx=request.socialIngestAuth!;
    if(!hasPermission(ctx,'intelligence.write')&&!hasPermission(ctx,'platform.admin'))return reply.code(403).send({error:'FORBIDDEN'});
  };
  const canReadAll=(ctx:AuthorizationContext)=>hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all');

  const itemSchema=z.object({
    platform:platformSchema,
    externalId:z.string().max(300).optional().nullable(),
    contentType:contentTypeSchema.default('post'),
    sourceKind:z.enum(['owned','external','manual']).default('external'),
    ownedAccountId:z.coerce.number().int().positive().optional().nullable(),
    opdId:z.coerce.number().int().positive().optional().nullable(),
    authorName:z.string().max(300).optional().nullable(),
    authorHandle:z.string().max(300).optional().nullable(),
    authorProfileUrl:z.string().url().max(2000).optional().nullable(),
    canonicalUrl:z.string().url().max(2000).optional().nullable(),
    title:z.string().max(1000).optional().nullable(),
    content:z.string().max(100000).optional().nullable(),
    language:z.string().max(20).optional().nullable(),
    publishedAt:z.string().optional().nullable(),
    rawPayload:z.unknown().optional(),
    metadata:z.unknown().optional(),
  });

  app.post('/api/social/ingestion/batch',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const parsed=z.object({collector:z.string().trim().min(2).max(100).default('manual-batch'),items:z.array(itemSchema).min(1).max(100)}).safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_REQUEST',details:parsed.error.flatten()});
    const ctx=request.socialIngestAuth!;
    const items:SocialCandidate[]=parsed.data.items.map(item=>({
      ...item,
      opdId:canReadAll(ctx)?(item.opdId??null):(ctx.opdId?Number(ctx.opdId):null),
      collector:parsed.data.collector,
    }));
    const result=await ingestSocialBatch(pool,items,parsed.data.collector);
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOCIAL_INGEST_BATCH',$2::jsonb)`,[ctx.id,JSON.stringify({collector:parsed.data.collector,received:result.received,succeeded:result.succeeded,failed:result.failed})]);
    return reply.code(result.failed?207:201).send({data:result});
  });

  app.post('/api/social/ingestion/website/:accountId',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const accountId=z.coerce.number().int().positive().safeParse((request.params as any).accountId);
    if(!accountId.success)return reply.code(400).send({error:'INVALID_ACCOUNT_ID'});
    const ctx=request.socialIngestAuth!;
    const startedAt=Date.now();
    try{
      const account=(await pool.query(`SELECT id,opd_id,account_name,profile_url FROM owned_social_accounts WHERE id=$1 AND platform='website' AND active=true LIMIT 1`,[accountId.data])).rows[0];
      if(!account)return reply.code(404).send({error:'WEBSITE_ACCOUNT_NOT_FOUND'});
      if(!canReadAll(ctx)&&String(account.opd_id??'')!==String(ctx.opdId??''))return reply.code(403).send({error:'FORBIDDEN'});

      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'WEBSITE_SOCIAL_INGEST_STARTED',$2::jsonb)`,
        [ctx.id,JSON.stringify({accountId:accountId.data,accountName:account.account_name,profileUrl:account.profile_url,routeVersion:'website-sync-v4'})],
      );

      const result=await collectOwnedWebsiteAccount(pool,accountId.data);
      let clustering=null;
      try{clustering=await rebuildOwnedContentClusters(pool)}catch(clusterError){app.log.warn({err:clusterError},'Owned content clustering refresh failed')}
      await pool.query(
        `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'WEBSITE_SOCIAL_INGEST',$2::jsonb)`,
        [ctx.id,JSON.stringify({accountId:accountId.data,feedUrl:result.feedUrl,mode:result.mode,fetched:result.fetched,succeeded:result.succeeded,failed:result.failed,clustering,durationMs:Date.now()-startedAt})],
      );
      return reply.code(result.failed?207:201).send({data:{...result,clustering}});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      app.log.error({err:error,accountId:accountId.data},'Website ingestion failed');
      try{
        await pool.query(
          `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'WEBSITE_SOCIAL_INGEST_FAILED',$2::jsonb)`,
          [ctx.id,JSON.stringify({accountId:accountId.data,message,durationMs:Date.now()-startedAt,routeVersion:'website-sync-v4'})],
        );
      }catch(auditError){
        app.log.error({err:auditError,accountId:accountId.data},'Failed to persist website ingestion error audit');
      }
      return reply.code(422).send({error:'WEBSITE_INGEST_FAILED',message});
    }
  });

  app.post('/api/social/ingestion/websites/refresh',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    const startedAt=Date.now();
    const params:unknown[]=[];
    let scope='';
    if(!canReadAll(ctx)){
      if(!ctx.opdId)return reply.code(403).send({error:'FORBIDDEN'});
      params.push(ctx.opdId);
      scope=`AND opd_id=$1`;
    }
    const {rows:accounts}=await pool.query<{id:string;account_name:string}>(
      `SELECT id,account_name FROM owned_social_accounts WHERE platform='website' AND active=true ${scope} ORDER BY is_primary_source DESC,source_priority DESC,id ASC`,
      params,
    );
    if(!accounts.length)return reply.send({data:{accounts:0,succeeded:0,failed:0,results:[],clustering:null,durationMs:Date.now()-startedAt}});

    const settled=await Promise.allSettled(accounts.map(async account=>{
      const result=await collectOwnedWebsiteAccount(pool,Number(account.id));
      return {ok:true as const,...result};
    }));
    const results=settled.map((entry,index)=>entry.status==='fulfilled'
      ?entry.value
      :{ok:false as const,accountId:Number(accounts[index].id),accountName:accounts[index].account_name,error:entry.reason instanceof Error?entry.reason.message:String(entry.reason)});
    const succeeded=results.filter(x=>x.ok).length;
    const failed=results.length-succeeded;
    let clustering=null;
    try{clustering=await rebuildOwnedContentClusters(pool)}catch(clusterError){app.log.warn({err:clusterError},'Owned content clustering failed after bulk website sync')}
    await pool.query(
      `INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'OWNED_WEBSITES_REFRESH',$2::jsonb)`,
      [ctx.id,JSON.stringify({accounts:accounts.length,succeeded,failed,results,clustering,durationMs:Date.now()-startedAt,routeVersion:'owned-websites-refresh-v1'})],
    );
    return reply.code(failed===accounts.length?422:failed?207:200).send({data:{accounts:accounts.length,succeeded,failed,results,clustering,durationMs:Date.now()-startedAt}});
  });

  app.get('/api/social/ingestion/status',{preHandler:auth},async(request)=>{
    const ctx=request.socialIngestAuth!;
    const params:unknown[]=[];
    const scope=canReadAll(ctx)?'':(ctx.opdId?(params.push(ctx.opdId),`WHERE sm.opd_id=$1`):'WHERE 1=0');
    const totals=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE sm.captured_at>=now()-interval '24 hours')::int captured_24h,COUNT(*) FILTER(WHERE sm.processing_status='failed')::int failed,MAX(sm.captured_at) last_captured_at FROM social_mentions sm ${scope}`,params);
    const platformParams=[...params];
    const platformScope=scope;
    const byPlatform=await pool.query(`SELECT sm.platform,COUNT(*)::int total,COUNT(*) FILTER(WHERE sm.captured_at>=now()-interval '24 hours')::int captured_24h,MAX(sm.captured_at) last_captured_at FROM social_mentions sm ${platformScope} GROUP BY sm.platform ORDER BY total DESC`,platformParams);
    const unmatched=await pool.query(`SELECT COUNT(*)::int count FROM social_mentions sm ${scope}${scope?' AND':' WHERE'} NOT EXISTS(SELECT 1 FROM social_mention_keywords smk WHERE smk.mention_id=sm.id)`,params);
    return {status:totals.rows[0],byPlatform:byPlatform.rows,unmatched:Number(unmatched.rows[0]?.count||0)};
  });

  app.get('/api/social/ingestion/readiness',{preHandler:auth},async()=>{
    const accounts=await pool.query(`SELECT platform,COUNT(*) FILTER(WHERE active=true)::int active_accounts FROM owned_social_accounts GROUP BY platform ORDER BY platform`);
    return {
      ownedAccounts:accounts.rows,
      providers:{
        website:{configured:true,platforms:['website'],mode:'hybrid-rss-html'},
        meta:{configured:Boolean(process.env.META_ACCESS_TOKEN),platforms:['instagram','facebook','threads']},
        youtube:{configured:Boolean(process.env.YOUTUBE_API_KEY),platforms:['youtube']},
        x:{configured:Boolean(process.env.X_BEARER_TOKEN),platforms:['x']},
        tiktok:{configured:Boolean(process.env.TIKTOK_ACCESS_TOKEN),platforms:['tiktok']},
      },
      note:'Website owned-channel collection uses hybrid RSS/Atom + HTML crawling. Other automatic provider collection requires provider credentials and adapter configuration.'
    };
  });
}
