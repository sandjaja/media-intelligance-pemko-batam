import test from 'node:test';
import assert from 'node:assert/strict';
import { collectYouTubeShortCandidates } from './youtube-shorts-collector.js';

function response(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

test('YouTube provider normalizes comments and paginated replies without live API quota',async(t)=>{
 const original=globalThis.fetch;
 const calls:string[]=[];
 globalThis.fetch=async(input:any)=>{
  const url=new URL(String(input)); calls.push(url.pathname+'?'+url.searchParams.toString());
  if(url.pathname.endsWith('/search'))return response({items:[{id:{videoId:'vid1'}}]});
  if(url.pathname.endsWith('/videos'))return response({items:[{id:'vid1',snippet:{title:'Keluhan parkir Kota Contoh',description:'Mohon ditindaklanjuti',channelTitle:'Warga',channelId:'ch1',publishedAt:'2026-09-19T00:00:00Z'},contentDetails:{duration:'PT45S'}}]});
  if(url.pathname.endsWith('/commentThreads'))return response({items:[{snippet:{topLevelComment:{id:'c1',snippet:{textDisplay:'Dishub tolong ditertibkan',authorDisplayName:'A',publishedAt:'2026-09-19T01:00:00Z'}},totalReplyCount:2},replies:{comments:[{id:'r1',snippet:{textDisplay:'Setuju',parentId:'c1'}}]}}]});
  if(url.pathname.endsWith('/comments'))return response({items:[{id:'r1',snippet:{textDisplay:'Setuju',parentId:'c1'}},{id:'r2',snippet:{textDisplay:'Saya juga',parentId:'c1'}}]});
  throw new Error('Unexpected URL '+url);
 };
 t.after(()=>{globalThis.fetch=original;});
 const out=await collectYouTubeShortCandidates({apiKey:'fixture-key',query:'parkir Kota Contoh'});
 assert.equal(out.length,3);
 assert.deepEqual(out.map(x=>x.externalId),['c1','r1','r2']);
 assert.equal(out[0].context?.parentContent?.externalId,'vid1');
 assert.equal(out[2].context?.parentComment?.externalId,'c1');
 assert.equal(out[0].context?.discovery?.query,'parkir Kota Contoh');
 assert.ok(calls.some(x=>x.startsWith('/youtube/v3/comments?')));
});

test('YouTube provider excludes non-short duration candidates',async(t)=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:any)=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith('/search'))return response({items:[{id:{videoId:'long1'}}]});
  if(url.pathname.endsWith('/videos'))return response({items:[{id:'long1',snippet:{title:'Long video'},contentDetails:{duration:'PT10M'}}]});
  throw new Error('comments must not be requested for excluded candidate');
 };
 t.after(()=>{globalThis.fetch=original;});
 const out=await collectYouTubeShortCandidates({apiKey:'fixture-key',query:'contoh'});
 assert.deepEqual(out,[]);
});

test('YouTube provider surfaces API failure without leaking credential',async(t)=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>response({error:{message:'quota'}},403);
 t.after(()=>{globalThis.fetch=original;});
 await assert.rejects(()=>collectYouTubeShortCandidates({apiKey:'secret-fixture',query:'contoh'}),(error:any)=>{
  assert.equal(error.message,'YOUTUBE_API_ERROR_403');
  assert.equal(error.message.includes('secret-fixture'),false);
  return true;
 });
});
