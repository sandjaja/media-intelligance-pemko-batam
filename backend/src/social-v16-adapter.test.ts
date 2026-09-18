import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSocialRoutingV16 } from './social-v16-adapter.js';

function fakePool(){
 return{
  async query(sql:string,params?:unknown[]){
   if(sql.includes('FROM organizations WHERE active=true'))return{rows:[{id:'1',name:'Pemerintah Kota Contoh',code:'PKC'}]};
   if(sql.includes('FROM government_branding WHERE active=true'))return{rows:[{government_name:'Pemerintah Kota Contoh',short_name:'Pemko Contoh',aliases:['Pemkot Contoh'],city_name:'Kota Contoh',tagline:null}]};
   if(sql.includes('FROM districts WHERE organization_id='))return{rows:[{name:'Kecamatan Utara',code:'UTARA'}]};
   if(sql.includes('FROM taxonomy_categories tc JOIN classification_sectors cs'))return{rows:[{id:'10',name:'Pelayanan Publik',sector_name:'Pemerintahan'}]};
   if(sql.includes('FROM keywords k JOIN keyword_taxonomy kt'))return{rows:[{keyword_id:'100',keyword:'pelayanan publik',evidence_strength:'DIRECT',taxonomy_id:'10',taxonomy_name:'Pelayanan Publik',taxonomy_weight:5,opd_id:'20',opd_weight:1,opd_name:'Dinas Pelayanan',opd_code:'DP'}]};
   if(sql.includes('FROM keyword_opd ko JOIN opd o'))return{rows:[{opd_id:'21'}]};
   if(sql.includes('SELECT id,code,name FROM opd WHERE id=ANY'))return{rows:[{id:'20',code:'DP',name:'Dinas Pelayanan'},{id:'21',code:'DK',name:'Dinas Komunikasi'}]};
   throw new Error('Unexpected query in Social V16 fixture: '+sql+' '+JSON.stringify(params));
  }
 } as any;
}

test('Social V16.5 routes normalized public conversation through Master Classification',async()=>{
 const result=await analyzeSocialRoutingV16(fakePool(),{title:'Warga membahas pelayanan publik',content:'Pemko Contoh menindaklanjuti masukan warga.'});
 assert.equal(result.routingStatus,'ROUTED');
 assert.equal(result.primaryOpdId,'20');
 assert.equal(result.keywordId,'100');
 assert.equal(result.taxonomyId,'10');
 assert.deepEqual(result.supportingOpdIds,['21']);
 assert.equal(result.needsVerification,false);
});

test('Social V16.5 does not calculate sentiment or risk in routing adapter',async()=>{
 const result:any=await analyzeSocialRoutingV16(fakePool(),{title:'Keluhan pelayanan publik',content:'Warga menyampaikan kritik.'});
 assert.equal('sentiment' in result,false);
 assert.equal('riskScore' in result,false);
});
