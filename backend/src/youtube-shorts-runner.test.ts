import test from 'node:test';
import assert from 'node:assert/strict';
import { runYouTubeShortsCollection } from './youtube-shorts-runner.js';

function response(body:any,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}

function dbFixture(){
 const inserted:string[]=[];
 const pool={async query(sql:string,params?:any[]){
  if(sql.includes('FROM organizations WHERE active=true'))return{rows:[{id:'1',name:'Pemerintah Kota Contoh',code:'PKC'}]};
  if(sql.includes('FROM government_branding WHERE is_active=true')||sql.includes('FROM government_branding WHERE active=true'))return{rows:[{government_name:'Pemerintah Kota Contoh',short_name:'Pemko Contoh',aliases:['Pemkot Contoh'],city_name:'Kota Contoh',tagline:null}]};
  if(sql.includes('FROM districts WHERE organization_id='))return{rows:[{name:'Utara'}]};
  if(sql.includes('FROM opd WHERE organization_id='))return{rows:[{id:'20',name:'Dinas Perhubungan',code:'DISHUB'}]};
  if(sql.includes('FROM uptd WHERE organization_id='))return{rows:[]};
  if(sql.includes('FROM taxonomy_categories tc JOIN classification_sectors cs'))return{rows:[]};
  if(sql.includes('FROM keywords k JOIN keyword_taxonomy kt'))return{rows:[]};
  if(sql.includes('FROM keyword_opd ko'))return{rows:[]};
  if(sql.includes('FROM keywords k')||sql.includes('FROM keyword_taxonomy'))return{rows:[]};
  if(sql.includes('INSERT INTO social_mentions')){inserted.push(String(params?.[1]));return{rows:[{id:inserted.length,platform:'youtube',external_id:params?.[1],opd_id:null,sentiment:'neutral',risk_score:0,risk_level:'LOW',processing_status:'captured',curation_status:null}]};}
  if(sql.includes('INSERT INTO evidence_sources'))return{rows:[]};
  throw new Error('Unexpected DB query: '+sql);
 }} as any;
 return{pool,inserted};
}

test('YouTube runner sends relevant contextual comment through ingestion while review is skipped',async(t)=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input:any)=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith('/search'))return response({items:[{id:{videoId:'vid1'}}]});
  if(url.pathname.endsWith('/videos'))return response({items:[{id:'vid1',snippet:{title:'Keluhan parkir Kota Contoh',description:'Warga meminta penertiban',channelTitle:'Warga'},contentDetails:{duration:'PT30S'}}]});
  if(url.pathname.endsWith('/commentThreads'))return response({items:[
   {snippet:{topLevelComment:{id:'relevant',snippet:{textDisplay:'Dishub tolong ditertibkan'}},totalReplyCount:0}},
   {snippet:{topLevelComment:{id:'review',snippet:{textDisplay:'Jalan ini rusak sekali'}},totalReplyCount:0}}
  ]});
  throw new Error('Unexpected URL '+url);
 };
 t.after(()=>{globalThis.fetch=original;});
 const {pool,inserted}=dbFixture();
 const result=await runYouTubeShortsCollection(pool,{apiKey:'fixture-key',query:'parkir Kota Contoh'});
 assert.equal(result.received,3);
 assert.equal(result.skipped,2);
 const relevant=result.results.find((r:any)=>r.externalId==='relevant'||r.external_id==='relevant') as any;
 assert.ok(relevant,JSON.stringify(result.results));
 assert.equal(relevant.ok,true,JSON.stringify(relevant));
 assert.deepEqual(inserted,['relevant']);
});

test('YouTube runner returns empty summary when provider finds no candidates',async(t)=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>response({items:[]});
 t.after(()=>{globalThis.fetch=original;});
 const {pool}=dbFixture();
 const result=await runYouTubeShortsCollection(pool,{apiKey:'fixture-key',query:'contoh'});
 assert.deepEqual(result,{received:0,succeeded:0,failed:0,skipped:0,results:[],diagnostics:{searchedVideos:0,shortCandidates:0,videosWithComments:0,commentsCollected:0}});
});
