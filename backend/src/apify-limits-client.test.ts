import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchApifyMonthlyHeadroom} from './apify-limits-client.js';
test('read-only limits call uses bearer auth and returns account headroom',async()=>{
 let url='',method='',authorization='';
 const fetcher=(async(u:string,init:RequestInit)=>{
  url=u;method=init.method??'';authorization=new Headers(init.headers).get('authorization')??'';
  return {ok:true,json:async()=>({data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:1.25}}})} as Response;
 }) as typeof fetch;
 assert.equal(await fetchApifyMonthlyHeadroom('secret',fetcher),3.75);
 assert.equal(url,'https://api.apify.com/v2/users/me/limits');
 assert.equal(method,'GET');assert.equal(authorization,'Bearer secret');
});
test('missing key, HTTP failure and invalid payload block usage checks',async()=>{
 const broken=(async()=>({ok:false}) as Response) as typeof fetch;
 assert.equal(await fetchApifyMonthlyHeadroom('',broken),null);
 assert.equal(await fetchApifyMonthlyHeadroom('secret',broken),null);
 const malformed=(async()=>({ok:true,json:async()=>({data:{id:'ok'}})}) as Response) as typeof fetch;
 assert.equal(await fetchApifyMonthlyHeadroom('secret',malformed),null);
});
