import {resolveManualSocialCollectionPolicy} from './social-manual-collection-policy.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { ingestSocialBatch, type SocialCandidate } from './social-collector.js';
import { collectOwnedWebsiteAccount } from './website-collector.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';
import { runCollection } from './collection-scheduler.js';

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
    if(!ctx.roles.includes('super_admin')&&!ctx.roles.includes('humas'))return reply.code(403).send({error:'HUMAS_OR_SUPER_ADMIN_REQUIRED'});
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

  app.get('/api/social/website/opd-comparison',{preHandler:auth},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    const canCompare=canReadAll(ctx)||ctx.roles.includes('humas')||ctx.roles.includes('executive');
    if(!canCompare)return reply.code(403).send({error:'FORBIDDEN'});
    const parsed=z.object({days:z.coerce.number().int().refine(v=>v===1||v===7||v===14||v===30).default(7)}).safeParse(request.query||{});
    if(!parsed.success)return reply.code(400).send({error:'INVALID_PERIOD'});
    const days=parsed.data.days;
    try{
      const rows=(await pool.query(`SELECT a.id account_id,a.opd_id,a.district_id,a.ownership_level,a.account_name,a.handle,a.profile_url,
        CASE WHEN a.ownership_level='pemko' THEN 'PEMKO' WHEN a.ownership_level='district' THEN COALESCE(d.code,'') ELSE COALESCE(o.code,'') END opd_code,CASE WHEN a.ownership_level='pemko' THEN 'Pemko Batam (Utama)' WHEN a.ownership_level='district' THEN COALESCE(d.name,a.account_name) ELSE COALESCE(o.name,a.account_name) END opd_name,
        COUNT(m.id) FILTER(WHERE COALESCE(m.published_at,m.captured_at)>=now()-make_interval(days => $1::int))::int articles_period,
        MAX(m.published_at) last_published_at,MIN(COALESCE(m.published_at,m.captured_at)) first_data_at,
        MAX(COALESCE(m.published_at,m.captured_at)) last_data_at
        FROM owned_social_accounts a
        LEFT JOIN opd o ON o.id=a.opd_id
        LEFT JOIN districts d ON d.id=a.district_id
        LEFT JOIN social_mentions m ON m.platform='website' AND m.owned_account_id=a.id
        WHERE a.platform='website' AND a.active=true
        GROUP BY a.id,a.opd_id,a.district_id,a.account_name,a.handle,a.profile_url,a.ownership_level,o.code,o.name,d.code,d.name
        ORDER BY articles_period DESC,opd_name ASC`,[days])).rows;
      const daily=(await pool.query(`SELECT date_trunc('day',COALESCE(m.published_at,m.captured_at))::date AS publication_date,a.id account_id,a.opd_id,a.district_id,a.ownership_level,
        CASE WHEN a.ownership_level='pemko' THEN 'Pemko Batam (Utama)' WHEN a.ownership_level='district' THEN COALESCE(d.name,a.account_name) ELSE COALESCE(o.name,a.account_name) END opd_name,COUNT(*)::int articles
        FROM owned_social_accounts a JOIN social_mentions m ON m.platform='website' AND m.owned_account_id=a.id
        LEFT JOIN opd o ON o.id=a.opd_id
        LEFT JOIN districts d ON d.id=a.district_id
        WHERE a.platform='website' AND a.active=true
          AND COALESCE(m.published_at,m.captured_at)>=now()-make_interval(days => $1::int)
        GROUP BY date_trunc('day',COALESCE(m.published_at,m.captured_at))::date,a.id,a.opd_id,a.district_id,a.ownership_level,o.name,d.name,a.account_name ORDER BY publication_date ASC`,[days])).rows;
      const data=rows.map(r=>({accountId:Number(r.account_id),opdId:r.opd_id==null?null:Number(r.opd_id),districtId:r.district_id==null?null:Number(r.district_id),ownershipLevel:r.ownership_level,opdCode:r.opd_code,opdName:r.opd_name,profileUrl:r.profile_url,
        articles:Number(r.articles_period||0),avgPerDay:Number((Number(r.articles_period||0)/days).toFixed(2)),
        lastPublishedAt:r.last_published_at,firstDataAt:r.first_data_at,lastDataAt:r.last_data_at,
        coverageDays:r.first_data_at?Math.min(days,Math.max(1,Math.ceil((Date.now()-new Date(r.first_data_at).getTime())/86400000))):0}));
      return reply.send({data:{days,summary:{websites:data.length,active:data.filter(x=>x.articles>0).length,totalArticles:data.reduce((n,x)=>n+x.articles,0),inactive:data.filter(x=>x.articles===0).length},opds:data,daily:daily.map(r=>({day:r.publication_date,accountId:Number(r.account_id),opdId:r.opd_id==null?null:Number(r.opd_id),districtId:r.district_id==null?null:Number(r.district_id),ownershipLevel:r.ownership_level,opdName:r.opd_name,articles:Number(r.articles)}))}});
    }catch(error){const message=error instanceof Error?error.message:String(error);app.log.error({err:error},'Website OPD comparison failed');return reply.code(500).send({error:'WEBSITE_OPD_COMPARISON_FAILED',message})}
  });

  app.get('/api/social/website/account-performance/:accountId',{preHandler:auth},async(request,reply)=>{
    const accountId=z.coerce.number().int().positive().safeParse((request.params as any).accountId);
    if(!accountId.success)return reply.code(400).send({error:'INVALID_ACCOUNT_ID'});
    const ctx=request.socialIngestAuth!;
    const account=(await pool.query(`SELECT id,opd_id,district_id,account_name,handle,profile_url FROM owned_social_accounts WHERE id=$1 AND platform='website' AND active=true LIMIT 1`,[accountId.data])).rows[0];
    if(!account)return reply.code(404).send({error:'WEBSITE_ACCOUNT_NOT_FOUND'});
    if(!canReadAll(ctx)&&!ctx.roles.includes('humas')){const allowed=ctx.roles.includes('district')?String(account.district_id??'')===String(ctx.districtId??''):String(account.opd_id??'')===String(ctx.opdId??'');if(!allowed)return reply.code(403).send({error:'FORBIDDEN'});}
    try{
      const stats=(await pool.query(`SELECT
        COUNT(*) FILTER(WHERE COALESCE(published_at,captured_at)>=now()-interval '7 days')::int articles_7d,
        COUNT(*) FILTER(WHERE COALESCE(published_at,captured_at)>=now()-interval '30 days')::int articles_30d,
        MAX(published_at) last_published_at,
        MAX(captured_at) last_captured_at
        FROM social_mentions WHERE platform='website' AND owned_account_id=$1`,[accountId.data])).rows[0];
      const recent=(await pool.query(`SELECT id,title,canonical_url,published_at,captured_at FROM social_mentions WHERE platform='website' AND owned_account_id=$1 ORDER BY COALESCE(published_at,captured_at) DESC LIMIT 10`,[accountId.data])).rows;
      const articles7=Number(stats?.articles_7d||0),articles30=Number(stats?.articles_30d||0);
      return reply.send({data:{account:{id:Number(account.id),opdId:account.opd_id==null?null:Number(account.opd_id),accountName:account.account_name,handle:account.handle,profileUrl:account.profile_url},metrics:{articles7d:articles7,articles30d:articles30,avgPerDay7d:Number((articles7/7).toFixed(2)),avgPerDay30d:Number((articles30/30).toFixed(2)),lastPublishedAt:stats?.last_published_at||null,lastCapturedAt:stats?.last_captured_at||null},recent}});
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      app.log.error({err:error,accountId:accountId.data},'Website account performance query failed');
      return reply.code(500).send({error:'WEBSITE_PERFORMANCE_FAILED',message});
    }
  });

  app.post('/api/social/ingestion/website/:accountId',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const accountId=z.coerce.number().int().positive().safeParse((request.params as any).accountId);
    if(!accountId.success)return reply.code(400).send({error:'INVALID_ACCOUNT_ID'});
    const ctx=request.socialIngestAuth!;
    const startedAt=Date.now();
    try{
      const account=(await pool.query(`SELECT id,opd_id,account_name,profile_url FROM owned_social_accounts WHERE id=$1 AND platform='website' AND active=true LIMIT 1`,[accountId.data])).rows[0];
      if(!account)return reply.code(404).send({error:'WEBSITE_ACCOUNT_NOT_FOUND'});
      if(!canReadAll(ctx)&&!ctx.roles.includes('humas')&&String(account.opd_id??'')!==String(ctx.opdId??''))return reply.code(403).send({error:'FORBIDDEN'});

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
    const force=(request.query as any)?.force==='true';
    if(!force){const recent=(await pool.query(`SELECT created_at FROM audit_logs WHERE action='OWNED_WEBSITES_REFRESH' AND created_at>=now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1`)).rows[0];if(recent)return reply.send({data:{skipped:true,reason:'FRESH_WITHIN_24H',lastRefresh:recent.created_at,durationMs:Date.now()-startedAt}})}
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

  // Read-only provider cost history; independent of billable collection and app ledger.
  app.get('/api/social/collection/apify/cost-history',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const query=z.object({platform:z.enum(['tiktok','instagram'])}).strict().safeParse(request.query);
    if(!query.success)return reply.code(400).send({error:'INVALID_APIFY_COST_HISTORY_QUERY'});
    try{
      const {decryptIntegrationCredential}=await import('./integration-credentials.js');
      const {fetchApifyActorCostHistory}=await import('./apify-run-cost-history.js');
      const {rows}=await pool.query(`SELECT c.credential_ciphertext FROM integration_credentials c
        JOIN integration_providers p ON p.id=c.provider_id AND p.code='apify' AND p.active=true
        JOIN organizations o ON o.id=c.organization_id AND o.active=true
        WHERE c.enabled=true LIMIT 2`);
      if(rows.length!==1||!rows[0]?.credential_ciphertext)return reply.code(503).send({error:'APIFY_CREDENTIAL_UNAVAILABLE'});
      const token=decryptIntegrationCredential(rows[0].credential_ciphertext);
      const actorId=query.data.platform==='tiktok'?'clockworks/tiktok-scraper':'apify/instagram-scraper';
      const history=await fetchApifyActorCostHistory({token,actorId});
      return reply.send({platform:query.data.platform,actorId,...history,source:'APIFY_PROVIDER',balanceVerified:false,
        note:'Historical per-run costs are not proof of available cash balance or future price.'});
    }catch{return reply.code(502).send({error:'APIFY_COST_HISTORY_UNAVAILABLE'});}
  });

  // Explicitly confirmed manual TikTok start. Apify is authoritative for account
  // balance; the browser cannot supply Actor input, credentials, or charge cap.
  // A successful response returns a Run ID for the existing import workflow.
  app.post('/api/social/collection/apify/start-direct',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    const parsed=z.object({platform:z.literal('tiktok'),maxVideos:z.union([z.literal(10),z.literal(20),z.literal(50)]),confirmed:z.literal(true)}).strict().safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'APIFY_EXPLICIT_CONFIRMATION_REQUIRED'});
    try{
      const {loadApifyAdminCollectorSettings}=await import('./apify-admin-collector-settings.js');
      const collectors=await loadApifyAdminCollectorSettings(pool);
      const actorId='clockworks/tiktok-scraper';
      const matching=collectors.filter(c=>c.actorId===actorId&&c.kind==='tiktok_posts'&&c.enabled);
      if(matching.length!==1)return reply.code(409).send({error:'APIFY_TIKTOK_ACTOR_NOT_ENABLED'});
      const {rows}=await pool.query(`SELECT s.settings,c.credential_ciphertext FROM integration_settings s JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true JOIN organizations o ON o.id=s.organization_id AND o.active=true JOIN integration_credentials c ON c.provider_id=p.id AND c.organization_id=o.id AND c.enabled=true LIMIT 2`);
      if(rows.length!==1||!rows[0]?.credential_ciphertext)return reply.code(503).send({error:'APIFY_CONFIGURATION_UNAVAILABLE'});
      const cap=rows[0]?.settings?.actorMaxCostUsd?.tiktok_posts;
      if(typeof cap!=='number'||!Number.isFinite(cap)||cap<0.5||cap>5||Math.abs(cap*100-Math.round(cap*100))>1e-8)
        return reply.code(409).send({error:'APIFY_TIKTOK_CHARGE_CAP_NOT_CONFIGURED'});
      const {decryptIntegrationCredential}=await import('./integration-credentials.js');
      const token=decryptIntegrationCredential(rows[0].credential_ciphertext);
      const {loadApifyGeographicSearchPlan}=await import('./apify-geographic-search.js');
      const {previewGeographicActorInput}=await import('./apify-geographic-input.js');
      const plan=await loadApifyGeographicSearchPlan(pool);
      const proposed=previewGeographicActorInput({actorId,plan,maxQueries:5,maxVideos:parsed.data.maxVideos});
      const actorInput=proposed.proposedInput;
      const terms=actorInput.searchQueries;
      if(!Array.isArray(terms)||terms.length===0||terms.some(x=>typeof x!=='string'||!/(?:^|\s)batam(?:$|\s)/i.test(x)))
        return reply.code(409).send({error:'APIFY_TIKTOK_GEOGRAPHIC_INPUT_INVALID'});
      const {inspectApifyActorPricing}=await import('./apify-actor-pricing-client.js');
      const pricing=await inspectApifyActorPricing(actorId,token);
      if(pricing.snapshot?.pricingModel!=='PAY_PER_EVENT'||!pricing.snapshot.capEligible||
        pricing.snapshot.minimalMaxTotalChargeUsd===null||cap<pricing.snapshot.minimalMaxTotalChargeUsd)
        return reply.code(409).send({error:'APIFY_TIKTOK_CHARGE_CAP_UNSUPPORTED'});
      // Never retry an uncertain provider response: it might already be billable.
      let response:Response;
      try{
        response=await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?maxTotalChargeUsd='+encodeURIComponent(String(cap)),{
          method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
          body:JSON.stringify(actorInput),signal:AbortSignal.timeout(20000)});
      }catch{
        return reply.code(502).send({error:'APIFY_START_UNCERTAIN_DO_NOT_RETRY_CHECK_APIFY_CONSOLE'});
      }
      if(!response.ok)return reply.code(502).send({error:'APIFY_PROVIDER_REJECTED_RUN',providerStatus:response.status});
      let runId:unknown;
      try{runId=((await response.json()) as {data?:{id?:unknown}}).data?.id}catch{}
      if(typeof runId!=='string'||!/^[a-zA-Z0-9_-]{5,160}$/.test(runId))
        return reply.code(502).send({error:'APIFY_START_UNCERTAIN_DO_NOT_RETRY_CHECK_APIFY_CONSOLE'});
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'APIFY_DIRECT_RUN_STARTED',$2::jsonb)`,
        [ctx.id,JSON.stringify({platform:'tiktok',runId,maxVideos:parsed.data.maxVideos,maxTotalChargeUsd:cap})]).catch(error=>app.log.error({err:error,runId},'Apify start audit failed'));
      return reply.send({data:{platform:'tiktok',runId,maxVideos:parsed.data.maxVideos,maxTotalChargeUsd:cap,status:'STARTED',billableRunStarted:true}});
    }catch(error){app.log.error({err:error},'Apify direct start failed');return reply.code(422).send({error:'APIFY_DIRECT_START_PREPARATION_FAILED'});}
  });

  app.post('/api/social/collection/run',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    // Reject client attempts to smuggle a paid-run authorization into this
    // preview endpoint. A future paid route must have separate server checks.
    const selection=z.object({platform:z.enum(['semua','tiktok','instagram','youtube','apify']).default('youtube'),maxVideos:z.union([z.literal(10),z.literal(20),z.literal(50)]).optional()}).strict().safeParse(request.body??{});
    if(!selection.success)return reply.code(400).send({error:'INVALID_SOCIAL_COLLECTION_PLATFORM'});
    // Preserve the existing YouTube path; paid Apify platforms remain preview-only.
    const platform=selection.data.platform;
    const policy=resolveManualSocialCollectionPolicy(platform);
    const youtube=policy.runYouTube;
    const result=youtube?await runCollection(pool,'MANUAL',String(ctx.id),['social']):{ok:true,skipped:true,reason:'YOUTUBE_NOT_SELECTED'};
    const apifyPlatforms=policy.previewApifyPlatforms;
    const apify=await Promise.all(apifyPlatforms.map(async selected=>{
      try{
        const {previewManualApifyCollection}=await import('./apify-manual-preview.js');
        return{platform:selected,...await previewManualApifyCollection(pool,{platform:selected,requestedBy:String(ctx.id),maxVideos:selection.data.maxVideos??10})};
      }catch{return{platform:selected,ready:false,reason:'APIFY_PREVIEW_UNAVAILABLE',collectors:[] as string[]}}
    }));
    // Explicit API contract: this endpoint is preview-only for Apify, even if
    // a browser displays a consent checkbox. No paid confirmation is issued.
    const response={...result,selection:platform,apify,billableRunStarted:false,
      apifyExecution:{mode:policy.apifyExecutionMode,paidApifyAuthorized:policy.paidApifyAuthorized,
        confirmationAvailable:false,confirmationRequiredForPaidRun:true,paidRunEndpointConnected:false}};
    await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'SOCIAL_MANUAL_COLLECTION',$2::jsonb)`,[ctx.id,JSON.stringify({selection:platform,runId:result.runId??null,status:result.status??null,skipped:result.skipped??false,reason:result.reason??null,apify:apify.map(item=>({platform:item.platform,ready:item.ready,reason:item.reason,collectors:item.collectors})),billableRunStarted:false})]);
    return reply.send({data:response});
  });

  // Import an already completed, ledger-authorized Apify run. This endpoint
  // never starts an Actor and never accepts a dataset ID or token from clients.
  app.post('/api/social/collection/apify/import-completed',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    if(!ctx.roles.includes('super_admin')&&!ctx.roles.includes('humas'))return reply.code(403).send({error:'HUMAS_OR_SUPER_ADMIN_REQUIRED'});
    const parsed=z.object({platform:z.enum(['tiktok','instagram']),runId:z.string().regex(/^[a-zA-Z0-9_-]{5,160}$/)}).strict().safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_APIFY_IMPORT_REQUEST'});
    const {platform,runId}=parsed.data;
    const actorId=platform==='tiktok'?'clockworks/tiktok-scraper':'apify/instagram-scraper';
    try{
      const {verifyApifyLedgerRun}=await import('./apify-ledger-run-verification.js');
      await verifyApifyLedgerRun(pool,{runId,actorId,platform});
      const {decryptIntegrationCredential}=await import('./integration-credentials.js');
      const credentials=await pool.query(`SELECT c.credential_ciphertext FROM integration_credentials c
        JOIN integration_providers p ON p.id=c.provider_id AND p.code='apify' AND p.active=true
        JOIN organizations o ON o.id=c.organization_id AND o.active=true
        WHERE c.enabled=true LIMIT 2`);
      if(credentials.rows.length!==1||!credentials.rows[0]?.credential_ciphertext)
        return reply.code(503).send({error:'APIFY_CREDENTIAL_UNAVAILABLE'});
      const token=decryptIntegrationCredential(credentials.rows[0].credential_ciphertext);
      const response=await fetch('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(runId),{
        headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)return reply.code(502).send({error:'APIFY_RUN_LOOKUP_FAILED'});
      const payload=await response.json() as {data?:{id?:unknown;status?:unknown;defaultDatasetId?:unknown}};
      const run=payload?.data;
      if(run?.id!==runId||run.status!=='SUCCEEDED'||typeof run.defaultDatasetId!=='string'||
        !/^[a-zA-Z0-9_-]{5,160}$/.test(run.defaultDatasetId))
        return reply.code(409).send({error:'APIFY_RUN_NOT_COMPLETED'});
      const input={confirmedRunId:runId,datasetId:run.defaultDatasetId,token};
      const result=platform==='tiktok'
        ?await (await import('./apify-tiktok-dataset.js')).ingestCompletedApifyTikTokDataset(pool,input)
        :await (await import('./apify-instagram-dataset.js')).ingestCompletedApifyInstagramDataset(pool,input);
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'APIFY_COMPLETED_RUN_IMPORT',$2::jsonb)`,
        [ctx.id,JSON.stringify({platform,runId,datasetItems:result.datasetItems,received:result.received,succeeded:result.succeeded,failed:result.failed})]);
      return reply.send({data:{platform,runId,...result,billableRunStarted:false}});
    }catch(error){
      app.log.error({err:error,platform,runId},'Apify completed-run import failed');
      return reply.code(422).send({error:'APIFY_COMPLETED_RUN_IMPORT_FAILED'});
    }
  });

  // Import a historical run executed directly in the owner's Apify account.
  // This path is deliberately separate from the paid-run ledger: it cannot
  // start an Actor or grant budget authorization to a future paid run.
  app.post('/api/social/collection/apify/import-external',{preHandler:[auth,requireWrite]},async(request,reply)=>{
    const ctx=request.socialIngestAuth!;
    if(!ctx.roles.includes('super_admin')&&!ctx.roles.includes('humas'))return reply.code(403).send({error:'HUMAS_OR_SUPER_ADMIN_REQUIRED'});
    const parsed=z.object({platform:z.enum(['tiktok','instagram']),runId:z.string().regex(/^[a-zA-Z0-9_-]{5,160}$/)}).strict().safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_APIFY_EXTERNAL_IMPORT_REQUEST'});
    const {platform,runId}=parsed.data;
    const actorId=platform==='tiktok'?'clockworks/tiktok-scraper':'apify/instagram-scraper';
    try{
      const {decryptIntegrationCredential}=await import('./integration-credentials.js');
      const credentials=await pool.query(`SELECT c.credential_ciphertext FROM integration_credentials c
        JOIN integration_providers p ON p.id=c.provider_id AND p.code='apify' AND p.active=true
        JOIN organizations o ON o.id=c.organization_id AND o.active=true
        WHERE c.enabled=true LIMIT 2`);
      if(credentials.rows.length!==1||!credentials.rows[0]?.credential_ciphertext)
        return reply.code(503).send({error:'APIFY_CREDENTIAL_UNAVAILABLE'});
      const token=decryptIntegrationCredential(credentials.rows[0].credential_ciphertext);
      const {resolveApifyActorInternalId}=await import('./apify-actor-identity.js');
      const expectedActorInternalId=await resolveApifyActorInternalId({actorId,token});
      const response=await fetch('https://api.apify.com/v2/actor-runs/'+encodeURIComponent(runId),{
        headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)return reply.code(502).send({error:'APIFY_EXTERNAL_RUN_LOOKUP_FAILED'});
      const payload=await response.json() as {data?:{id?:unknown;status?:unknown;defaultDatasetId?:unknown;actId?:unknown}};
      const run=payload?.data;
      if(run?.id!==runId||run.status!=='SUCCEEDED'||run.actId!==expectedActorInternalId||
        typeof run.defaultDatasetId!=='string'||!/^[a-zA-Z0-9_-]{5,160}$/.test(run.defaultDatasetId))
        return reply.code(409).send({error:'APIFY_EXTERNAL_RUN_NOT_VERIFIED'});
      const datasetId=run.defaultDatasetId;
      const {verifyCompletedApifyRunDataset}=await import('./apify-run-dataset-verification.js');
      await verifyCompletedApifyRunDataset({runId,datasetId,actorId,expectedActorInternalId,token});
      const items=platform==='tiktok'
        ?await (await import('./apify-tiktok-dataset.js')).fetchApifyTikTokDataset({datasetId,token})
        :await (await import('./apify-tiktok-dataset.js')).fetchApifyTikTokDataset({datasetId,token});
      const normalized=platform==='tiktok'
        ?(await import('./apify-tiktok-post-normalizer.js')).normalizeApifyTikTokPosts(items)
        :(await import('./apify-instagram-post-normalizer.js')).normalizeApifyInstagramPosts(items);
      const {loadOrganizationMediaScope}=await import('./organization-media-scope.js');
      const {classifySocialOrganizationScope}=await import('./social-organization-scope.js');
      const scope=await loadOrganizationMediaScope(pool);
      if(!scope)throw Error('APIFY_ORGANIZATION_SCOPE_UNAVAILABLE');
      const inScope=normalized.candidates.filter(candidate=>classifySocialOrganizationScope({title:candidate.title,content:candidate.content},scope).status!=='OUT_OF_SCOPE');
      const outOfScope=normalized.candidates.length-inScope.length;
      const result=inScope.length?await ingestSocialBatch(pool,inScope,'apify-'+platform+'-external'):{received:0,succeeded:0,failed:0,results:[]};
      await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'APIFY_EXTERNAL_RUN_IMPORT',$2::jsonb)`,
        [ctx.id,JSON.stringify({platform,runId,datasetItems:items.length,rejected:normalized.rejected,outOfScope,received:result.received,succeeded:result.succeeded,failed:result.failed})]);
      return reply.send({data:{platform,runId,datasetItems:items.length,rejected:normalized.rejected,outOfScope,...result,billableRunStarted:false,source:'EXTERNAL_APIFY_RUN'}});
    }catch(error){
      app.log.error({err:error,platform,runId},'Apify external run import failed');
      return reply.code(422).send({error:'APIFY_EXTERNAL_RUN_IMPORT_FAILED'});
    }
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
