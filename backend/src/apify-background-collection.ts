import type {Pool} from 'pg';
import {advanceActiveApifyJob,type ActiveApifyJob} from './apify-active-collection.js';
import {reconcileCollectionRun} from './collection-run-result.js';
/** Each Actor completion wakes this driver. Import pages and skipped/queued steps
 * persist independently; a failed callback is retried by Apify, never a paid POST. */
export async function driveBackgroundApifyJob(pool:Pool,jobId:string,budgetMs=75000,completedKind?:string){
 const deadline=Date.now()+budgetMs;
 for(let n=0;n<150&&Date.now()<deadline;n++){
  const job=await advanceActiveApifyJob(pool,jobId);
  if(!job)throw Error('APIFY_CALLBACK_BUSY_RETRY');
  if(job.schedulerRunId)await reconcileCollectionRun(pool,job.schedulerRunId);
  if(job.status!=='RUNNING')return job;
  const step=job.steps.find(s=>!['DONE','SKIPPED','FAILED','UNCERTAIN'].includes(s.status));
  if(step?.status==='STARTING')throw Error('APIFY_CALLBACK_START_PENDING_RETRY');
  if(step?.status==='RUNNING'){if(step.kind===completedKind)throw Error('APIFY_CALLBACK_TERMINAL_STATUS_PENDING_RETRY');return job;} // next wake-up is its registered webhook
 }
 throw Error('APIFY_CALLBACK_CONTINUE_RETRY');
}
export async function getBackgroundApifyJob(pool:Pool,jobId:string){
 return(await pool.query(`SELECT metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'jobId'=$1`,[jobId])).rows[0]?.metadata as ActiveApifyJob|undefined;
}
/** A failed first preparation has no completion webhook to wake it. Record that
 * failure only if no paid request could have been sent; never rewrite STARTING. */
export async function failUnstartedBackgroundApifyJob(pool:Pool,jobId:string){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const row=(await client.query(`SELECT id,metadata FROM audit_logs WHERE action='APIFY_ACTIVE_COLLECTION' AND metadata->>'jobId'=$1 FOR UPDATE`,[jobId])).rows[0];
  if(row){const job=row.metadata as ActiveApifyJob;
   if(job.status==='RUNNING'&&!job.steps.some(s=>s.runId||['STARTING','RUNNING','IMPORTING','UNCERTAIN'].includes(s.status))){
    for(const step of job.steps)if(step.status==='QUEUED'){step.status='FAILED';step.error='APIFY_BACKGROUND_PREPARATION_FAILED';}
    job.status='FAILED';await client.query(`UPDATE audit_logs SET metadata=$2::jsonb WHERE id=$1`,[row.id,JSON.stringify(job)]);
   }
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
