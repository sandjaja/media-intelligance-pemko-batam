import type {Pool} from 'pg';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {apifyCallbackBaseUrl,apifyCallbackSignature} from './apify-callback-auth.js';
import {createActiveApifyJob} from './apify-active-collection.js';
import {driveBackgroundApifyJob,failUnstartedBackgroundApifyJob} from './apify-background-collection.js';
import {apifyCollectionSummary} from './collection-run-result.js';
export async function startScheduledApifyCollection(pool:Pool,runId:string,trigger:'MANUAL'|'SCHEDULED',now?:Date){
 const collectors=await loadApifyAdminCollectorSettings(pool);
 if(!collectors.some(c=>c.enabled))return{status:'SKIPPED',reason:'APIFY_NO_COLLECTORS_ENABLED'};
 const callbackBaseUrl=apifyCallbackBaseUrl();
 // Fail before any billable request if server callbacks cannot be authenticated.
 apifyCallbackSignature('configuration-check');
 const job=await createActiveApifyJob(pool,'apify',100,null,{schedulerRunId:runId,trigger,callbackBaseUrl,now});
 // No polling wait here. Actor completion resumes the durable state via webhook.
 try{const started=await driveBackgroundApifyJob(pool,job.jobId);return apifyCollectionSummary(started);}
 catch(e){await failUnstartedBackgroundApifyJob(pool,job.jobId);throw e;}
}
