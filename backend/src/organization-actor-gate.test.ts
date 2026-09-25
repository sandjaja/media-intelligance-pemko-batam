import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyArticleOrganizationScope, classifyOnlineArticleRole } from './organization-actor-gate.js';
import type { OrganizationMediaScope } from './organization-media-scope.js';
import type { OnlineArticle } from './online-media-collector.js';

const scope:OrganizationMediaScope={
 organizationId:1,organizationName:'Pemerintah Kota Batam',organizationCode:'PEMKO_BATAM',
 governmentName:'Pemerintah Kota Batam',shortName:'Pemko Batam',governmentAliases:['Pemkot Batam'],
 cityName:'Batam',tagline:null,districts:['Sekupang','Nongsa'],
 villages:[],actors:[{kind:'OPD',id:20,name:'Dinas Perhubungan Kota Batam',code:'DISHUB',aliases:['dinas perhubungan kota batam','dinas perhubungan','dishub']}]
};
const article=(title:string,excerpt?:string):OnlineArticle=>({sourceId:'test',title,url:'https://example.test/a',publishedAt:new Date(),excerpt});

test('generic Dishub headline alone does not prove Batam scope',()=>{
 const d=classifyArticleOrganizationScope(article('Dishub mengecek feeder bus'));
 assert.equal(d.status,'OUT_OF_SCOPE');
 const role=classifyOnlineArticleRole(article('Dishub mengecek feeder bus'),scope);
 assert.equal(role.role,'OUT_OF_SCOPE');
});

test('Batam evidence in headline confirms organization scope',()=>{
 const d=classifyArticleOrganizationScope(article('Dishub Batam mengecek feeder bus'),scope);
 assert.equal(d.status,'RELEVANT');
});

test('Batam evidence in lead confirms organization scope for generic headline',()=>{
 const a=article('Dishub mengecek feeder bus','Dinas Perhubungan Kota Batam melakukan pengecekan layanan feeder.');
 const d=classifyArticleOrganizationScope(a,scope);
 assert.equal(d.status,'RELEVANT');
 const role=classifyOnlineArticleRole(a,scope);
 assert.equal(role.scope.status,'RELEVANT');
 assert.ok(role.actorMatches.some(x=>x.kind==='OPD'&&x.id===20));
});

test('district evidence in lead can establish Batam geographic scope',()=>{
 const d=classifyArticleOrganizationScope(article('Dishub mengecek feeder bus','Pengecekan dilakukan di Sekupang pada pagi hari.'),scope);
 assert.equal(d.status,'RELEVANT');
});
