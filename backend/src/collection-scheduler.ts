import type { Pool } from 'pg';
import { runOnlineSourceCollection } from './online-article-moderation-routes.js';
import { clusterNewOnlineArticles } from './online-story-clustering.js';
import { collectOwnedWebsiteAccount } from './website-collector.js';
import { rebuildOwnedContentClusters } from './owned-content-clustering.js';
import { runYouTubeShortsCollection } from './youtube-shorts-runner.js';
import { decryptIntegrationCredential } from './integration-credentials.js';

export type CollectionSource='online'|'owned'|'social';
export type CollectionTrigger='SCHEDULED'|'MANUAL';

export async function getCollectionConfig(pool:Pool){
  const {rows}=await pool.query(`SELECT id,enabled,timezone,run_time,online_enabled,owned_enabled,social_enabled,last_run_at,next_run_at,updated_at FROM collection_scheduler_config WHERE id=1`);
  return rows[0]??null;
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
  let clustering:any=null;
  if(succeeded){try{clustering=await rebuildOwnedContentClusters(pool)}catch{}}
  return {accounts:rows.length,succeeded,failed,results,clustering};
}

async function collectSocial(pool:Pool){
  const organizations=(await pool.query(`SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2`)).rows;
  if(organizations.length!==1)throw new Error('ACTIVE_ORGANIZATION_UNRESOLVED');
  const orgId=Number(organizations[0].id);
  const row=(await pool.query(`SELECT c.credential_ciphertext,c.enabled,COALESCE(s.settings,'{}'::jsonb) settings FROM integration_credentials c JOIN integration_providers p ON p.id=c.provider_id LEFT JOIN integration_settings s ON s.provider_id=p.id AND s.organization_id=c.organization_id WHERE c.organization_id=$1 AND p.code='youtube' LIMIT 1`,[orgId])).rows[0];
  if(!row?.enabled)return {providers:1,succeeded:0,failed:0,results:[{provider:'youtube',skipped:true,reason:'YOUTUBE_INTEGRATION_DISABLED'}]};
  const settings=row.settings||{}; const query=String(settings.query||settings.collectionQuery||'').trim();
  if(query.length<2)return {providers:1,succeeded:0,failed:0,results:[{provider:'youtube',skipped:true,reason:'SOCIAL_COLLECTION_QUERY_NOT_CONFIGURED'}]};
  const maxResults=Math.max(1,Math.min(25,Number(settings.maxResults||25)));
  try{const result=await runYouTubeShortsCollection(pool,{apiKey:decryptIntegrationCredential(row.credential_ciphertext),query,maxResults});const itemResults=result.results||[];return {providers:1,succeeded:1,failed:0,diagnostics:{query,maxResults,searchedVideos:result.diagnostics?.searchedVideos??0,shortCandidates:result.diagnostics?.shortCandidates??0,videosWithComments:result.diagnostics?.videosWithComments??0,commentsCollected:result.diagnostics?.commentsCollected??0,received:result.received,savedOrUpdated:result.succeeded,skipped:result.skipped,ingestionFailed:result.failed,manualLocked:itemResults.filter((x:any)=>x.reason==='MANUAL_CLASSIFICATION_LOCKED').length,outOfScope:itemResults.filter((x:any)=>String(x.reason||'').startsWith('ORGANIZATION_SCOPE_')).length,scopeReview:itemResults.filter((x:any)=>x.reason==='ORGANIZATION_SCOPE_REVIEW').length},results:[{provider:'youtube',query,maxResults,...result}]};}
  catch(error){return {providers:1,succeeded:0,failed:1,results:[{provider:'youtube',query,error:error instanceof Error?error.message:String(error)}]};}
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

export async function runCollection(pool:Pool,trigger:CollectionTrigger,requestedBy:string|null,sources:CollectionSource[]){
  const lock=await pool.query(`SELECT pg_try_advisory_lock(78124599) acquired`);
  if(!lock.rows[0]?.acquired)return {ok:false,skipped:true,reason:'COLLECTION_ALREADY_RUNNING'};
  let runId:string|null=null;
  try{
    const run=await pool.query(`INSERT INTO collection_scheduler_runs(trigger_type,status,requested_by,sources) VALUES($1,'RUNNING',$2,$3::jsonb) RETURNING id`,[trigger,requestedBy,JSON.stringify({selected:sources})]);
    runId=String(run.rows[0].id);
    const result:any={};
    if(sources.includes('online'))result.online=summarizeOnline(await collectOnline(pool));
    if(sources.includes('owned'))result.owned=await collectOwned(pool);
    if(sources.includes('social'))result.social=await collectSocial(pool);
    const failed=Number(result.online?.failed||0)+Number(result.owned?.failed||0)+Number(result.social?.failed||0);
    const successful=(result.online?.succeeded||0)+(result.owned?.succeeded||0)+(result.social?.succeeded||0);
    const status=failed>0?(successful>0?'PARTIAL':'FAILED'):'SUCCESS';
    await pool.query(`UPDATE collection_scheduler_runs SET status=$2,finished_at=now(),result=$3::jsonb WHERE id=$1`,[runId,status,JSON.stringify(result)]);
    await pool.query(`UPDATE collection_scheduler_config SET last_run_at=now(),updated_at=updated_at WHERE id=1`);
    return {ok:status!=='FAILED',runId,status,result};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(runId)await pool.query(`UPDATE collection_scheduler_runs SET status='FAILED',finished_at=now(),error_message=$2 WHERE id=$1`,[runId,message]).catch(()=>undefined);
    throw error;
  }finally{await pool.query(`SELECT pg_advisory_unlock(78124599)`).catch(()=>undefined)}
}

export async function runScheduledCollectionIfDue(pool:Pool,now=new Date()){
  const config=await getCollectionConfig(pool);
  if(!config?.enabled)return {ok:true,skipped:true,reason:'SCHEDULER_DISABLED'};
  const tz=String(config.timezone||'Asia/Jakarta');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const hour=parts.find(x=>x.type==='hour')?.value||'00';
  const scheduled=String(config.run_time||'08:00:00').slice(0,5);
  if(`${hour}:00`!==scheduled.slice(0,2)+':00')return {ok:true,skipped:true,reason:'NOT_DUE',scheduled};
  if(config.last_run_at){
    const last=new Date(config.last_run_at);
    const dayFmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
    if(dayFmt.format(last)===dayFmt.format(now))return {ok:true,skipped:true,reason:'ALREADY_RAN_TODAY'};
  }
  const sources:CollectionSource[]=[];
  if(config.online_enabled)sources.push('online');
  if(config.owned_enabled)sources.push('owned');
  if(config.social_enabled)sources.push('social');
  if(!sources.length)return {ok:true,skipped:true,reason:'NO_SOURCE_ENABLED'};
  return runCollection(pool,'SCHEDULED',null,sources);
}
