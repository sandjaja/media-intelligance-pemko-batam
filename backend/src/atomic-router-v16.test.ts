import test from 'node:test';
import assert from 'node:assert/strict';
import { routeArticleV16 } from './atomic-router-v16.js';

function fakePool(mode:'taxonomy'|'opd'){
 return {async query(sql:string,params?:unknown[]){
  if(sql.includes('SELECT id,title,summary,content FROM articles'))return{rows:[{id:'1',title:mode==='opd'?'Dishub meninjau lokasi':'Pelayanan publik menjadi perhatian warga',summary:'Warga meminta tindak lanjut.',content:''}]};
  if(sql.includes('FROM taxonomy_categories tc JOIN classification_sectors cs'))return{rows:[{id:'10',name:'Pelayanan Publik',sector_name:'Pemerintahan'}]};
  if(sql.includes('FROM keywords k JOIN keyword_taxonomy kt'))return{rows:[]};
  if(sql.includes('FROM organizations WHERE active=true'))return{rows:[{id:'1',name:'Pemerintah Kota Contoh',code:'PKC'}]};
  if(sql.includes('FROM government_branding WHERE is_active=true'))return{rows:[{government_name:'Pemerintah Kota Contoh',short_name:'Pemko Contoh',aliases:['Pemkot Contoh'],city_name:'Kota Contoh',tagline:null}]};
  if(sql.includes('FROM districts WHERE organization_id='))return{rows:[]};
  if(sql.includes('SELECT v.name FROM villages'))return{rows:[]};
  if(sql.includes('FROM organization_area_aliases'))return{rows:[]};
  if(sql.includes('FROM opd WHERE organization_id='))return{rows:[{id:'30',name:'Dinas Perhubungan',code:'DISHUB'}]};
  if(sql.includes('FROM uptd WHERE organization_id='))return{rows:[]};
  if(sql.startsWith('DELETE ')||sql.startsWith('UPDATE ')||sql.startsWith('INSERT '))return{rows:[]};
  throw new Error('Unexpected query: '+sql);
 }} as any;
}

test('Online V16 taxonomy without keyword or OPD stays supporting/unrouted',async()=>{
 const result=await routeArticleV16(fakePool('taxonomy'),'1');
 assert.equal(result?.routingStatus,'UNROUTED');
 assert.equal(result?.opdId,null);
 assert.equal(result?.keywordMatches,0);
 assert.deepEqual(result?.headlineTaxonomyNames,['Pelayanan Publik']);
});

test('Online V16 OPD without Master Keyword becomes ambiguous',async()=>{
 const result=await routeArticleV16(fakePool('opd'),'1');
 assert.equal(result?.routingStatus,'AMBIGUOUS');
 assert.equal(String(result?.opdId),'30');
 assert.equal(result?.opdName,'Dinas Perhubungan');
 assert.equal(result?.keywordMatches,0);
});
