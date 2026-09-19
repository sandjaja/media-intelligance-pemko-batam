import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestSocialCandidate } from './social-collector.js';

function scopeRows(sql:string){
 if(sql.includes('FROM organizations WHERE active=true'))return[{id:'1',name:'Pemerintah Kota Contoh',code:'PKC'}];
 if(sql.includes('FROM government_branding WHERE is_active=true'))return[{government_name:'Pemerintah Kota Contoh',short_name:'Pemko Contoh',aliases:['Pemkot Contoh'],city_name:'Kota Contoh',tagline:null}];
 if(sql.includes('FROM districts WHERE organization_id='))return[{name:'Utara'}];
 if(sql.includes('FROM opd WHERE organization_id='))return[{id:'20',name:'Dinas Perhubungan',code:'DISHUB'}];
 if(sql.includes('FROM uptd WHERE organization_id='))return[];
 return null;
}

test('Social ingestion skips REVIEW before classification or INSERT',async()=>{
 let inserted=false;
 const pool={async query(sql:string){
  const rows=scopeRows(sql); if(rows)return{rows};
  if(sql.includes('INSERT INTO social_mentions'))inserted=true;
  throw new Error('Unexpected query after scope gate: '+sql);
 }} as any;
 const result:any=await ingestSocialCandidate(pool,{platform:'instagram',contentType:'comment',content:'Dishub tolong dong parkir ini ditertibkan'});
 assert.equal(result.skipped,true);
 assert.equal(result.reason,'ORGANIZATION_SCOPE_REVIEW');
 assert.equal(inserted,false);
});

test('Social ingestion skips OUT_OF_SCOPE even when discovery query contains organization area',async()=>{
 let inserted=false;
 const pool={async query(sql:string){
  const rows=scopeRows(sql); if(rows)return{rows};
  if(sql.includes('INSERT INTO social_mentions'))inserted=true;
  throw new Error('Unexpected query after scope gate: '+sql);
 }} as any;
 const result:any=await ingestSocialCandidate(pool,{
  platform:'threads',content:'Pelayanan pelabuhan hari ini lambat',
  context:{discovery:{method:'keyword',query:'Kota Contoh parkir'}}
 });
 assert.equal(result.skipped,true);
 assert.equal(result.reason,'ORGANIZATION_SCOPE_OUT_OF_SCOPE');
 assert.equal(inserted,false);
});

test('Social ingestion passes contextual comment beyond scope gate',async()=>{
 let reachedClassification=false;
 const pool={async query(sql:string){
  const rows=scopeRows(sql); if(rows)return{rows};
  if(sql.includes('FROM taxonomy_categories tc JOIN classification_sectors cs')){reachedClassification=true;return{rows:[]};}
  if(sql.includes('FROM keywords k JOIN keyword_taxonomy kt'))return{rows:[]};
  throw new Error('STOP_AFTER_CLASSIFICATION_GATE');
 }} as any;
 await assert.rejects(()=>ingestSocialCandidate(pool,{
  platform:'instagram',contentType:'comment',content:'Dishub tolong dong parkir ini ditertibkan',
  context:{parentContent:{content:'Keluhan parkir warga Kota Contoh'}}
 }),/STOP_AFTER_CLASSIFICATION_GATE/);
 assert.equal(reachedClassification,true);
});
