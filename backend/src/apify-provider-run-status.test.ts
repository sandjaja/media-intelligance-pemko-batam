import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchApifyRunStatus} from './apify-provider-run-status.js';
const base={providerRunId:'runABCDE123',token:'test-token'};
test('reads provider run and cost using GET and Authorization header',async()=>{
 let called='';
 const fetchImpl=(async(url:string,opts:RequestInit)=>{
  called=String(opts.method)+' '+url;
  assert.equal((opts.headers as Record<string,string>).Authorization,'Bearer test-token');
  return{ok:true,json:async()=>({data:{id:base.providerRunId,status:'SUCCEEDED',usageTotalUsd:0.15}})};
 }) as unknown as typeof fetch;
 const result=await fetchApifyRunStatus({...base,fetchImpl});
 assert.equal(result.verified,true);
 assert.equal(result.actualUsd,0.15);
 assert.match(called,/^GET https:\/\/api.apify.com\/v2\/actor-runs\//);
});
test('rejects mismatched provider IDs and unverified cost',async()=>{
 const fetchImpl=(async()=>({ok:true,json:async()=>({data:{id:'otherRun123',status:'SUCCEEDED',usageTotalUsd:0.15}})})) as unknown as typeof fetch;
 assert.equal((await fetchApifyRunStatus({...base,fetchImpl})).verified,false);
 const noCost=(async()=>({ok:true,json:async()=>({data:{id:base.providerRunId,status:'SUCCEEDED'}})})) as unknown as typeof fetch;
 assert.equal((await fetchApifyRunStatus({...base,fetchImpl:noCost})).actualUsd,null);
});
test('fails closed on missing token and provider error',async()=>{
 assert.equal((await fetchApifyRunStatus({...base,token:''})).verified,false);
 const fetchImpl=(async()=>({ok:false,status:429})) as unknown as typeof fetch;
 assert.equal((await fetchApifyRunStatus({...base,fetchImpl})).reason,'APIFY_RUN_LOOKUP_HTTP_429');
});
