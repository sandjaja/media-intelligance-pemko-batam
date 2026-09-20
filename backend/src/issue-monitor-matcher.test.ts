import test from 'node:test';
import assert from 'node:assert/strict';
import { matchActiveIssueMonitors } from './issue-monitor-matcher.js';

function poolWith(rows:any[]){
 return {query:async()=>({rows})} as any;
}

const monitor={monitor_id:1,issue_id:2,name:'Banjir',taxonomy_category_id:17,terms:['banjir','genangan','drainase']};

test('matches active monitor by term/source/window query result and taxonomy',async()=>{
 const out=await matchActiveIssueMonitors(poolWith([monitor]),{sourceType:'social',publishedAt:'2026-09-21T08:00:00+07:00',title:'Banjir kembali melanda Batam',content:'Terjadi genangan',taxonomyId:17});
 assert.equal(out.length,1);
 assert.equal(out[0].issueId,2);
 assert.deepEqual(out[0].matchedTerms,['banjir','genangan']);
});

test('rejects same taxonomy when no monitor term occurs',async()=>{
 const out=await matchActiveIssueMonitors(poolWith([monitor]),{sourceType:'social',publishedAt:'2026-09-21T08:00:00+07:00',title:'Normalisasi sungai',content:'Pekerjaan berjalan lancar',taxonomyId:17});
 assert.equal(out.length,0);
});

test('rejects taxonomy mismatch even when term occurs',async()=>{
 const out=await matchActiveIssueMonitors(poolWith([monitor]),{sourceType:'social',publishedAt:'2026-09-21T08:00:00+07:00',title:'Banjir di Batam',taxonomyId:29});
 assert.equal(out.length,0);
});
