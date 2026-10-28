/** One shared startup attempt; transient failures can recover after a short backoff. */
export function createBackendStartup(start:()=>Promise<void>,retryMs=5000,now=Date.now){
 let ready:Promise<void>|null=null,nextRetry=0;
 return async()=>{
  if(!ready){
   if(now()<nextRetry)throw Error('BACKEND_RETRY_LATER');
   ready=Promise.resolve().then(start).catch(error=>{ready=null;nextRetry=now()+retryMs;throw error;});
  }
  return ready;
 };
}
