import test from 'node:test';import assert from 'node:assert/strict';import {checkIssueEvidenceEligibility} from './issue-evidence-eligibility.js';
const db=(rows:any[])=>({query:async()=>({rows,rowCount:rows.length})}) as any;
test('print requires analyzed',async()=>{assert.equal((await checkIssueEvidenceEligibility(db([{status:'analyzed'}]),'PRINT',1)).eligible,true);assert.equal((await checkIssueEvidenceEligibility(db([{status:'draft'}]),'PRINT',1)).eligible,false)});
test('owned requires approved analyzed locked V16',async()=>{assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'owned',curation_status:'approved',metadata:{v16Routing:{routingStatus:'ROUTED',verificationStatus:'LOCKED',generatedAt:'2026-09-20T00:00:00Z'}}}]),'OWNED',1)).eligible,true)});
test('online requires UTAMA plus latest verified',async()=>{assert.equal((await checkIssueEvidenceEligibility(db([{news_classification:'UTAMA',verification_action:'ARTICLE_CLASSIFICATION_VERIFIED'}]),'ONLINE',1)).eligible,true);assert.equal((await checkIssueEvidenceEligibility(db([{news_classification:'UTAMA',verification_action:'ARTICLE_CLASSIFICATION_REOPENED'}]),'ONLINE',1)).eligible,false)});
test('social manual classification alone is not verification',async()=>{assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'external',metadata:{manualClassification:{newsClassification:'UTAMA',locked:true},socialVerification:{status:'REOPENED'}}}]),'SOCIAL',1)).eligible,false);assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'external',metadata:{v16Routing:{newsClassification:'UTAMA'},socialVerification:{status:'LOCKED'}}}]),'SOCIAL',1)).eligible,true)});

test('online PENDUKUNG and unverified UTAMA are hard rejected',async()=>{
 assert.equal((await checkIssueEvidenceEligibility(db([{news_classification:'PENDUKUNG',verification_action:'ARTICLE_CLASSIFICATION_VERIFIED'}]),'ONLINE',1)).eligible,false);
 assert.equal((await checkIssueEvidenceEligibility(db([{news_classification:'UTAMA',verification_action:null}]),'ONLINE',1)).eligible,false);
});
test('social PENDUKUNG AMBIGU and unlocked UTAMA are hard rejected',async()=>{
 assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'external',metadata:{v16Routing:{newsClassification:'PENDUKUNG'},socialVerification:{status:'LOCKED'}}}]),'SOCIAL',1)).eligible,false);
 assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'external',metadata:{v16Routing:{newsClassification:'AMBIGU'},socialVerification:{status:'LOCKED'}}}]),'SOCIAL',1)).eligible,false);
 assert.equal((await checkIssueEvidenceEligibility(db([{source_kind:'external',metadata:{v16Routing:{newsClassification:'UTAMA'},socialVerification:{status:'REOPENED'}}}]),'SOCIAL',1)).eligible,false);
});
