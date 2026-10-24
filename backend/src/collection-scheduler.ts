import type { Pool } from 'pg';
import {startScheduledApifyCollection} from './apify-scheduled-collection.js';
import {reconcileCollectionRun} from './collection-run-result.js';
import { runOnlineSourceCollection } from './online-article-moderation-routes.js';
import { clusterNewOnlineArticles } from './online-story-clustering.js';
import { collectOwnedWebsiteAccount } from './website-collector.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';
import { ingestSocialBatch } from './social-collector.js';
import { getExternalSocialProvider, loadExternalSocialProviderContext } from './external-social-provider.js';
import { loadOrganizationMediaScope } from './organization-media-scope.js';
import { persistSocialConversationClusters } from './social-conversation-clustering.js';

import {scheduledSocialPlatforms,type ScheduledSocialPlatform} from './social-scheduler-platforms.js';

export type CollectionSource='online'|'owned'|'social';
export type CollectionTrigger='SCHEDULED'|'MANUAL';

export async function getCollectionConfig(pool:Pool){
  const {rows}=await pool.query(`SELECT id,enabled,timezone,run_time,online_enabled,owned_enabled,social_enabled,last_run_at,next_run_at,updated_at,to_jsonb(collection_scheduler_config)->'social_platforms' AS social_platforms FROM collection_scheduler_config WHERE id=1`);
  return rows[0]?{...rows[0],social_platforms:scheduledSocialPlatforms(rows[0].social_platforms)}:null;
}

async function collectOnline(pool:Pool){
  // Scheduler and the Media Online action share one per-source collection runner.
  const organizations=(await pool.query(`SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2`)).rows;
  if(organizations.length!==1)throw new Error('ACTIVE_ORGANIZATION_UNRESOLVED');
  const orgId=Number(organizations[0].id);
  const {rows}=await pool.query(`SELECT id,name,url,tier,active,category FROM media_sources WHERE active=true AND url IS NOT NULL AND lower(category)='online' ORDER BY tier ASC,name ASC`);
  const results:Record<string,unknown>[]=[];
  let inserted=0;
  for(const source of rows){
    try{const result=await runOnlineSourceCollection(pool,source,orgId);inserted+=Number(result.inserted||0);results.push(result)}
    catch(error){results.push({source:source.name,sourceId:String(source.id),collector:'online-interactive-v13-shared-runner',error:error instanceof Error?error.message:String(error)})}
  }
  let clustering:any=null;
  if(inserted>0){try{clustering=await clusterNewOnlineArticles(pool)}catch(error){clustering={error:error instanceof Error?error.message:String(error)}}}
  return {results,clustering};
}

async function collectOwned(pool:Pool){
  const {rows}=await pool.query(`SELECT id,account_name FROM owned_social_accounts WHERE platform='website' AND active=true AND profile_url IS NOT NULL ORDER BY is_primary_source DESC,source_priority DESC,id ASC`);
  const results:any[]=[];
  for(const row of rows){
    try{results.push({ok:true,...await collectOwnedWebsiteAccount(pool,Number(row.id))})}
    catch(error){results.push({ok:false,accountId:Number(row.id),accountName:row.account_name,error:error instanceof Error?error.message:String(error)})}
  }
  const succeeded=results.filter(x=>x.ok).length,failed=results.length-succeeded;
  // Rebuilding owned clusters is CPU-heavy. Only do it when collection actually
  // persisted new/updated mentions instead of on every successful account check.
  const changed=results.reduce((n,x)=>n+(x.ok?Number(x.succeeded??x.inserted??x.savedOrUpdated??0):0),0);
  let clustering:any=null;
  if(changed>0){try{clustering=await rebuildOwnedContentClusters(pool)}catch{}}
  return {accounts:rows.length,succeeded,failed,changed,results,clustering};
}

async function collectSocial(pool:Pool,trigger:CollectionTrigger){
  const scope=await loadOrganizationMediaScope(pool);
  if(!scope)throw new Error('ACTIVE_ORGANIZATION_UNRESOLVED');
  const orgId=scope.organizationId,provider=getExternalSocialProvider('youtube');
  if(!provider)throw new Error('YOUTUBE_PROVIDER_NOT_REGISTERED');
  const context=await loadExternalSocialProviderContext(pool,orgId,'youtube');
  if(!context)return {providers:1,succeeded:0,failed:0,diagnostics:{status:'YOUTUBE_INTEGRATION_DISABLED'},results:[{provider:'youtube',skipped:true,reason:'YOUTUBE_INTEGRATION_DISABLED'}]};
  const configuredMax=Math.max(1,Math.min(25,Number(context.settings.maxResults||25)));
  // Scheduled discovery is intentionally lightweight. Manual collection keeps the
  // wider historical/comment sweep for an operator who explicitly requests it.
  const scheduled=trigger==='SCHEDULED';
  const maxResults=scheduled?Math.min(10,configuredMax):configuredMax;
  const organizationQueries=[scope.governmentName,scope.shortName,scope.organizationName,...scope.governmentAliases]
    .map(v=>String(v||'').trim()).filter(v=>v.length>=3&&!/^\d+$/.test(v))
    .filter((v,i,a)=>a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i).slice(0,5);
  const issueDiscoveryRows=(await pool.query(`SELECT i.id,i.status,(SELECT x.keyword FROM (SELECT uci.snapshot->>'primaryKeyword' keyword,110 priority,0::bigint id FROM unified_candidate_issues uci WHERE uci.issue_id=i.id AND uci.status IN ('APPROVED','MERGED') AND NULLIF(uci.snapshot->>'primaryKeyword','') IS NOT NULL UNION ALL SELECT k.keyword,100,k.id FROM issue_articles ia JOIN article_manual_keywords amk ON amk.article_id=ia.article_id AND amk.active=true JOIN keywords k ON k.id=amk.keyword_id AND k.active=true WHERE ia.issue_id=i.id AND (amk.keyword_role='PRIMARY' OR amk.keyword_role IS NULL) UNION ALL SELECT COALESCE(NULLIF(pa.ai_metadata->'phase2e'->'manualPrimaryKeyword'->>'keyword',''),k.keyword,pa.ai_metadata->'v16Routing'->>'keyword'),95,COALESCE(k.id,0) FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id LEFT JOIN keywords k ON k.id::text=COALESCE(pa.ai_metadata->'phase2e'->'manualPrimaryKeyword'->>'keywordId',pa.ai_metadata->'v16Routing'->>'keywordId') AND k.active=true WHERE ipa.issue_id=i.id AND ipa.linkage_status='linked' UNION ALL SELECT k.keyword,90,k.id FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id JOIN keywords k ON k.id::text=COALESCE(sm.metadata->'manualClassification'->>'keywordId',sm.metadata->'v16Routing'->>'keywordId') AND k.active=true WHERE smi.issue_id=i.id) x WHERE NULLIF(x.keyword,'') IS NOT NULL ORDER BY x.priority DESC,x.id LIMIT 1) primary_keyword FROM issues i WHERE i.organization_id=$1 AND i.status IN ('active','watch') ORDER BY CASE WHEN i.status='active' THEN 0 ELSE 1 END,i.updated_at DESC LIMIT 3`,[orgId])).rows;
  const issueQueries=issueDiscoveryRows.map((r:any)=>String(r.primary_keyword||'').trim()).filter((v:string)=>v.length>=3).map((v:string)=>/\bbatam\b/i.test(v)?v:`${v} Batam`).filter((v:string,i:number,a:string[])=>a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i);
  const queries=[...organizationQueries,...issueQueries].filter((v,i,a)=>a.findIndex(x=>x.toLowerCase()===v.toLowerCase())===i);
  if(!queries.length)return {providers:1,succeeded:0,failed:0,diagnostics:{status:'SOCIAL_DISCOVERY_TERMS_NOT_AVAILABLE'},results:[{provider:'youtube',skipped:true,reason:'SOCIAL_DISCOVERY_TERMS_NOT_AVAILABLE'}]};
  const collectionWindowDays=scheduled?2:7;
  const fallbackAfter=Date.now()-collectionWindowDays*24*60*60*1000;
  const lastSuccessful=(await pool.query(`SELECT finished_at FROM collection_scheduler_runs WHERE status IN ('SUCCESS','PARTIAL') AND finished_at IS NOT NULL AND sources->'selected' ? 'social' ORDER BY finished_at DESC LIMIT 1`)).rows[0]?.finished_at;
  const overlapMs=6*60*60*1000;
  const watermarkAfter=lastSuccessful?new Date(lastSuccessful).getTime()-overlapMs:fallbackAfter;
  const publishedAfter=new Date(scheduled?Math.max(fallbackAfter,watermarkAfter):fallbackAfter).toISOString();
  const allResults:any[]=[];const seenCandidates=new Set<string>();let searchedVideos=0,shortCandidates=0,videosWithComments=0,commentsCollected=0,uniqueShorts=0,uniqueCommentsReplies=0,received=0,savedOrUpdated=0,skipped=0,ingestionFailed=0,crossQueryDuplicates=0;
  for(const query of queries){
    try{
      const collected=await provider.collect(context,{query,maxResults,publishedAfter,includeComments:!scheduled});
      const d:any=collected.diagnostics||{};searchedVideos+=Number(d.searchedVideos||0);shortCandidates+=Number(d.shortCandidates||0);videosWithComments+=Number(d.videosWithComments||0);commentsCollected+=Number(d.commentsCollected||0);
      if(!collected.candidates.length)continue;
      const uniqueCandidates=collected.candidates.filter(candidate=>{const key=`${candidate.platform}:${candidate.externalId||candidate.canonicalUrl||''}`;if(seenCandidates.has(key)){crossQueryDuplicates++;return false}seenCandidates.add(key);return true});
      if(!uniqueCandidates.length)continue;
      uniqueShorts+=uniqueCandidates.filter(candidate=>candidate.contentType==='short').length;
      uniqueCommentsReplies+=uniqueCandidates.filter(candidate=>candidate.contentType==='comment'||candidate.contentType==='reply').length;
      const ingested=await ingestSocialBatch(pool,uniqueCandidates,'youtube-shorts'),results=ingested.results as any[];
      received+=ingested.received;savedOrUpdated+=results.filter(x=>x.ok===true&&x.skipped!==true).length;skipped+=results.filter(x=>x.skipped===true).length;ingestionFailed+=ingested.failed;allResults.push(...results);
    }catch(error){ingestionFailed++;allResults.push({ok:false,query,error:error instanceof Error?error.message:String(error)});}
  }
  let clustering:any=null;
  if(savedOrUpdated>0){try{clustering=await persistSocialConversationClusters(pool,orgId,7)}catch(error){clustering={error:error instanceof Error?error.message:String(error)}}}
  const manualLocked=allResults.filter(x=>x.reason==='CLASSIFICATION_LOCKED').length;
  const scopeReview=allResults.filter(x=>x.reason==='ORGANIZATION_SCOPE_REVIEW_REQUIRED').length;
  const outOfScope=allResults.filter(x=>x.reason==='ORGANIZATION_SCOPE_OUT_OF_SCOPE').length;
  const ingestionErrors=allResults.filter(x=>x.ok===false).slice(0,5).map(x=>({platform:x.platform??'youtube',externalId:x.externalId??null,query:x.query??null,error:String(x.error||'UNKNOWN_ERROR').slice(0,240)}));
  return {providers:1,succeeded:ingestionFailed<queries.length?1:0,failed:ingestionFailed>=queries.length?1:0,diagnostics:{discovery:'ORGANIZATION_PLUS_ACTIVE_WATCH_ISSUES',organizationQueries,issueQueries,queries,maxResults,collectionWindowDays,publishedAfter,watermarkSource:lastSuccessful?'LAST_SUCCESSFUL_SOCIAL_RUN_WITH_6H_OVERLAP':'FALLBACK_WINDOW',commentsMode:scheduled?'SKIPPED_SCHEDULED':'FULL_MANUAL',crossQueryDuplicates,searchedVideos,shortCandidates,videosWithComments,commentsCollected,uniqueShorts,uniqueCommentsReplies,received,savedOrUpdated,skipped,ingestionFailed,manualLocked,outOfScope,scopeReview,clustering,ingestionErrors},results:[{provider:'youtube',queries,maxResults,results:allResults}]};
}

function summarizeOnline(batch:{results:Record<string,unknown>[],clustering:any}){
  const results=batch.results;
  return {
    sources:results.length,
    succeeded:results.filter(x=>!x.error&&!x.skipped).length,
    failed:results.filter(x=>!!x.error).length,
    fetched:results.reduce((n,x)=>n+(typeof x.fetched==='number'?x.fetched:0),0),
    inserted:results.reduce((n,x)=>n+(typeof x.inserted==='number'?x.inserted:0),0),
    duplicateSkipped:results.reduce((n,x)=>n+(typeof x.duplicateSkipped==='number'?x.duplicateSkipped:0),0),
    results,
    clustering:batch.clustering
  };
}

export async function runCollection(pool:Pool,trigger:CollectionTrigger,requestedBy:string|null,sources:CollectionSource[],options:{includeApify?:boolean;now?:Date;socialPlatforms?:ScheduledSocialPlatform[]}={}){
  const platforms=scheduledSocialPlatforms(options.socialPlatforms??(trigger==='MANUAL'&&!options.includeApify?['youtube']:undefined));
  const lockClient=await pool.connect();
  let lock;
  try{await lockClient.query('BEGIN');lock=await lockClient.query(`SELECT pg_try_advisory_xact_lock(78124599) acquired`);}catch(e){await lockClient.query('ROLLBACK').catch(()=>undefined);lockClient.release();throw e;}
  if(!lock.rows[0]?.acquired){await lockClient.query('ROLLBACK');lockClient.release();return {ok:false,skipped:true,reason:'COLLECTION_ALREADY_RUNNING'};}
  let runId:string|null=null;
  try{
    if(trigger==='SCHEDULED'){
      const existing=(await pool.query(`SELECT id FROM collection_scheduler_runs WHERE trigger_type='SCHEDULED' AND (started_at AT TIME ZONE 'Asia/Jakarta')::date=($1::timestamptz AT TIME ZONE 'Asia/Jakarta')::date LIMIT 1`,[(options.now??new Date()).toISOString()])).rows[0];
      if(existing)return {ok:true,skipped:true,reason:'ALREADY_RAN_TODAY',runId:String(existing.id)};
    }
    const run=await pool.query(`INSERT INTO collection_scheduler_runs(trigger_type,status,requested_by,sources) VALUES($1,'RUNNING',$2,$3::jsonb) RETURNING id`,[trigger,requestedBy,JSON.stringify({selected:sources,socialPlatforms:sources.includes('social')?platforms:[]})]);
    runId=String(run.rows[0].id);
    const result:any={};
    // Start Apify first: its webhook can run while the other sources collect.
    // The Media Sosial YouTube button still calls this runner without includeApify.
    if(sources.includes('social')&&(trigger==='SCHEDULED'||options.includeApify)&&platforms.some(p=>p!=='youtube')){
      try{result.apify=await startScheduledApifyCollection(pool,runId,trigger,options.now,platforms.filter((p):p is 'instagram'|'tiktok'=>p!=='youtube'))}
      catch(error){result.apify={status:'FAILED',error:error instanceof Error&&/^APIFY_[A-Z0-9_]+$/.test(error.message)?error.message:'APIFY_SCHEDULE_FAILED'}}
    }
    for(const source of sources){
      try{
        if(source==='online')result.online=summarizeOnline(await collectOnline(pool));
        if(source==='owned')result.owned=await collectOwned(pool);
        if(source==='social')result.social=platforms.includes('youtube')?await collectSocial(pool,trigger):{succeeded:0,failed:0,skipped:true,reason:'YOUTUBE_NOT_SELECTED'};
      }catch(error){result[source]={succeeded:0,failed:1,error:error instanceof Error?error.message:'COLLECTION_SOURCE_FAILED'}}
    }
    result.baseComplete=true;
    const {status,result:mergedResult}=await reconcileCollectionRun(pool,runId,result);
    await pool.query(`UPDATE collection_scheduler_config SET last_run_at=now(),updated_at=updated_at WHERE id=1`);
    return {ok:status!=='FAILED',runId,status,result:mergedResult};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(runId)await pool.query(`UPDATE collection_scheduler_runs SET status='FAILED',finished_at=now(),error_message=$2 WHERE id=$1`,[runId,message]).catch(()=>undefined);
    throw error;
  }finally{await lockClient.query('ROLLBACK').catch(()=>undefined);lockClient.release()}
}

export async function runScheduledCollectionIfDue(pool:Pool,now=new Date()){
  const config=await getCollectionConfig(pool);
  if(!config?.enabled)return {ok:true,skipped:true,reason:'SCHEDULER_DISABLED'};
  const tz=String(config.timezone||'Asia/Jakarta');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const hour=parts.find(x=>x.type==='hour')?.value||'00';
  const scheduled=String(config.run_time||'08:00:00').slice(0,5);
  if(`${hour}:00`!==scheduled.slice(0,2)+':00')return {ok:true,skipped:true,reason:'NOT_DUE',scheduled};
  // One scheduled attempt per Jakarta day. Callback retries resume its Apify job.
  // Manual "Jalankan Sekarang" runs must never consume the daily schedule.
  const latestScheduled=(await pool.query(
    `SELECT started_at AS finished_at
       FROM collection_scheduler_runs
      WHERE trigger_type='SCHEDULED'
      ORDER BY started_at DESC
      LIMIT 1`
  )).rows[0];
  if(latestScheduled?.finished_at){
    const last=new Date(latestScheduled.finished_at);
    const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
    if(dayFmt.format(last)===dayFmt.format(now))return {ok:true,skipped:true,reason:'ALREADY_RAN_TODAY'};
  }
  const sources:CollectionSource[]=[];
  if(config.online_enabled)sources.push('online');
  if(config.owned_enabled)sources.push('owned');
  if(config.social_enabled&&config.social_platforms.length)sources.push('social');
  if(!sources.length)return {ok:true,skipped:true,reason:'NO_SOURCE_ENABLED'};
  return runCollection(pool,'SCHEDULED',null,sources,{now,socialPlatforms:config.social_platforms});
}
