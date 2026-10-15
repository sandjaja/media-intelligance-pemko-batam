import type {Pool} from 'pg';
import type {ActiveApifyJob} from './apify-active-collection.js';
export function apifyCollectionSummary(job:ActiveApifyJob){
 return{jobId:job.jobId,status:job.status,period:job.period,steps:job.steps.map(({kind,actorId,status,runId,counts,costUsd,error})=>({kind,actorId,status,runId,counts,costUsd,error}))};
}
export function collectionResultStatus(result:Record<string,any>){
 if(!result.baseComplete||result.apify?.status==='RUNNING')return 'RUNNING';
 const failed=Number(result.online?.failed||0)+Number(result.owned?.failed||0)+Number(result.social?.failed||0)+(['FAILED','PARTIAL','UNCERTAIN'].includes(result.apify?.status)?1:0);
 const succeeded=Number(result.online?.succeeded||0)+Number(result.owned?.succeeded||0)+Number(result.social?.succeeded||0)+(result.apify?.status==='DONE'||result.apify?.status==='PARTIAL'?1:0);
 return failed?(succeeded?'PARTIAL':'FAILED'):'SUCCESS';
}
/** Merge under a row lock: a fast webhook and the main collector cannot overwrite each other's result. */
export async function reconcileCollectionRun(pool:Pool,runId:string,baseResult?:Record<string,any>){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const row=(await client.query(`SELECT result FROM collection_scheduler_runs WHERE id=$1 FOR UPDATE`,[runId])).rows[0];
  if(!row)throw Error('COLLECTION_RUN_NOT_FOUND');
  const result={...(row.result??{}),...(baseResult??{})};
  const job=(await client.query(`SELECT metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'schedulerRunId'=$1 ORDER BY created_at DESC LIMIT 1`,[runId])).rows[0]?.metadata as ActiveApifyJob|undefined;
  if(job)result.apify=apifyCollectionSummary(job);
  const status=collectionResultStatus(result);
  await client.query(`UPDATE collection_scheduler_runs SET status=$2,finished_at=CASE WHEN $2='RUNNING' THEN NULL ELSE now() END,result=$3::jsonb WHERE id=$1`,[runId,status,JSON.stringify(result)]);
  await client.query('COMMIT');return{status,result};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
