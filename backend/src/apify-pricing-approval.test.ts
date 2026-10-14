import assert from 'node:assert/strict';
import test from 'node:test';
import {conservativeApifyRunEstimate} from './apify-pricing-approval.js';
const actorId='apify/instagram-scraper';
const approval={actorId,maximumRunCostUsd:0.3,verifiedAt:new Date().toISOString(),source:'actor-pricing-confirmed' as const,includesAllEventsAndOverheads:true};
test('pricing without verified maximum remains blocked',()=>{
 assert.equal(conservativeApifyRunEstimate(actorId,null),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,includesAllEventsAndOverheads:false}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,actorId:'clockworks/tiktok-scraper'}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,verifiedAt:'2020-01-01T00:00:00Z'}),null);
});
test('accepts current exact Actor conservative maximum',()=>{
 assert.equal(conservativeApifyRunEstimate(actorId,approval),0.3);
});

test('standby hashtag actors require exact fresh verified maximum too',()=>{
 for(const standbyId of ['clockworks/tiktok-hashtag-scraper','apify/instagram-hashtag-scraper']){
  assert.equal(conservativeApifyRunEstimate(standbyId,null),null);
  assert.equal(conservativeApifyRunEstimate(standbyId,{...approval,actorId:standbyId,includesAllEventsAndOverheads:false}),null);
  assert.equal(conservativeApifyRunEstimate(standbyId,{...approval,actorId:standbyId}),0.3);
 }
});

test('rejects future, malformed and non-finite pricing approvals',()=>{
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,verifiedAt:new Date(Date.now()+60000).toISOString()}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,verifiedAt:'not-a-date'}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,maximumRunCostUsd:Infinity}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,maximumRunCostUsd:NaN}),null);
 assert.equal(conservativeApifyRunEstimate(actorId,{...approval,maximumRunCostUsd:0}),null);
});
