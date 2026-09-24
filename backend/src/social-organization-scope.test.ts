import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySocialOrganizationScope } from './social-organization-scope.js';
import type { OrganizationMediaScope } from './organization-media-scope.js';

const scope:OrganizationMediaScope={
 organizationId:1,
 organizationName:'Pemerintah Kota Contoh',
 organizationCode:'PKC',
 governmentName:'Pemerintah Kota Contoh',
 shortName:'Pemko Contoh',
 governmentAliases:['Pemkot Contoh'],
 cityName:'Kota Contoh',
 tagline:null,
 districts:['Utara'],
 villages:[],
 actors:[{kind:'OPD',id:20,name:'Dinas Perhubungan',code:'DISHUB',aliases:['dinas perhubungan','dishub']}]
};

test('explicit organization identity is relevant',()=>{
 const d=classifySocialOrganizationScope({content:'Pemko Contoh mohon tindak lanjuti parkir ini'},scope);
 assert.equal(d.status,'RELEVANT');
});

test('internal actor in comment inherits area context from parent content',()=>{
 const d=classifySocialOrganizationScope({
  content:'Dishub tolong dong parkir ini ditertibkan',
  context:{parentContent:{content:'Keluhan parkir warga Kota Contoh'}}
 },scope);
 assert.equal(d.status,'RELEVANT');
});

test('generic internal actor without organization or area context is out of scope',()=>{
 const d=classifySocialOrganizationScope({content:'Dishub tolong dong parkir ini ditertibkan'},scope);
 assert.equal(d.status,'OUT_OF_SCOPE');
});

test('area-only conversation requires review instead of automatic relevance',()=>{
 const d=classifySocialOrganizationScope({content:'Jalan di Kota Contoh rusak parah'},scope);
 assert.equal(d.status,'REVIEW');
});

test('discovery query is provenance and cannot make unrelated content relevant',()=>{
 const d=classifySocialOrganizationScope({
  content:'Pelayanan pelabuhan hari ini lambat',
  context:{discovery:{method:'keyword',query:'Kota Contoh parkir'}}
 },scope);
 assert.equal(d.status,'OUT_OF_SCOPE');
});

test('external-looking parent with area name but no internal actor stays review',()=>{
 const d=classifySocialOrganizationScope({
  content:'Pelayanannya lambat sekali',
  context:{parentContent:{content:'Badan Otorita Kota Contoh memperbarui layanan pelabuhan'}}
 },scope);
 assert.equal(d.status,'REVIEW');
});


test('explicit external government actor overrides local topic context',()=>{
 const d=classifySocialOrganizationScope({title:'Dinkes Kabupaten Lain imbau warga pakai masker dampak udara tak sehat',content:'Kabut asap juga berdampak pada wilayah Kota Contoh'},scope);
 assert.equal(d.status,'OUT_OF_SCOPE');
 assert.match(d.reason,/outside the active organization area/);
});
