import {createHmac,timingSafeEqual} from 'node:crypto';
export function apifyCallbackSignature(jobId:string){
 const secret=process.env.INTEGRATION_CREDENTIAL_KEY;
 if(!secret)throw Error('APIFY_CALLBACK_KEY_NOT_CONFIGURED');
 return createHmac('sha256',secret).update('apify-collection-callback:v1:'+jobId).digest('hex');
}
export function verifyApifyCallback(jobId:string,signature:string){
 if(!/^[0-9a-f]{64}$/.test(signature))return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(apifyCallbackSignature(jobId),'hex'));
}
export function apifyCallbackBaseUrl(env:NodeJS.ProcessEnv=process.env){
 // Preview must never send its callback to the production database/deployment.
 const raw=env.VERCEL_ENV==='preview'?env.VERCEL_URL:(env.PUBLIC_APP_URL||env.VERCEL_PROJECT_PRODUCTION_URL||env.VERCEL_URL);
 if(!raw)throw Error('APIFY_CALLBACK_URL_NOT_CONFIGURED');
 const url=new URL(raw.startsWith('https://')?raw:'https://'+raw);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||['localhost','127.0.0.1'].includes(url.hostname))throw Error('APIFY_CALLBACK_URL_INVALID');
 return url.origin;
}
export function apifyRunWebhookParameter(job:{jobId:string;callbackBaseUrl?:string},kind:string){
 if(!job.callbackBaseUrl)return '';
 const requestUrl=job.callbackBaseUrl+'/api/cron/apify-complete?jobId='+encodeURIComponent(job.jobId)+'&signature='+apifyCallbackSignature(job.jobId)+'&completedKind='+encodeURIComponent(kind);
 return '&webhooks='+encodeURIComponent(Buffer.from(JSON.stringify([{eventTypes:['ACTOR.RUN.SUCCEEDED','ACTOR.RUN.FAILED','ACTOR.RUN.ABORTED','ACTOR.RUN.TIMED_OUT'],requestUrl}])).toString('base64'));
}
