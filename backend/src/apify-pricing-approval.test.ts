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
