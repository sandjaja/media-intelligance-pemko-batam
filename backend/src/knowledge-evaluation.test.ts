import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeEvaluationSchema, summarizeKnowledgeSources } from './knowledge-evaluation.js';

test('evaluation derives durations and evidence limits from saved facts without inventing success',()=>{
 const result=summarizeKnowledgeSources({workflow:{created_at:'2026-10-01T00:00:00Z',closed_at:'2026-10-03T00:00:00Z',published_at:'2026-10-01T04:30:00Z',assigned_at:'2026-10-01T01:00:00Z'},response:{approved_at:'2026-10-01T03:00:00Z'},monitoring:{evidence:{total:5},assessment:{evidenceSufficiency:'LIMITED',cycleConclusion:'Bukti belum memadai',strengths:['Pesan konsisten'],nextCommunication:{recommendation:'Perjelas jadwal informasi.'}}},publication:{analysis:{executionAssessment:{status:'ALIGNED'}}},keywords:[{keyword:'sampah'}]});
 assert.equal(result.metrics.cycleHours,48);assert.equal(result.metrics.publicationHours,4.5);assert.equal(result.metrics.clarificationHours,2);
 assert.equal(result.metrics.evidenceSufficiency,'LIMITED');assert.match(result.metrics.conclusion,/belum dapat disimpulkan/);
 assert.deepEqual(result.proposal.lessons,[],'Humas supplies or reviews the lessons');assert.deepEqual(result.proposal.tags,['sampah']);
});
test('zero evidence overrides an unsupported sufficient claim and invalid dates remain unknown',()=>{
 const r=summarizeKnowledgeSources({workflow:{created_at:'invalid',closed_at:'2026-10-01'},monitoring:{evidence:{total:0},assessment:{evidenceSufficiency:'SUFFICIENT'}},keywords:[]});
 assert.equal(r.metrics.evidenceSufficiency,'INSUFFICIENT');assert.equal(r.metrics.cycleHours,null);assert.equal(r.metrics.publicationHours,null);
});
test('missing monitoring never fabricates zero evidence or effectiveness',()=>{
 const r=summarizeKnowledgeSources({workflow:{},keywords:[]});assert.equal(r.metrics.evidenceTotal,null);assert.equal(r.metrics.evidenceSufficiency,'INSUFFICIENT');assert.equal(r.metrics.executionStatus,null);
});
test('editorial schema discards user-supplied metric overrides',()=>{
 const e=knowledgeEvaluationSchema.parse({summary:'Ringkasan',strengths:[],weaknesses:[],lessons:[],recommendations:[],tags:[],metrics:{evidenceSufficiency:'SUFFICIENT'}});
 assert.ok(!('metrics' in e));
});
