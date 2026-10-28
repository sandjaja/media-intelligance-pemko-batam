import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateIssueRiskComponents, issueRiskLevel } from './issue-risk.js';

test('issue risk uses agreed 30/25/25/20 weighting',()=>{
 const r=calculateIssueRiskComponents({negativeShare:80,negativeIntensity:80,importance:70,impact:65,velocity:90});
 assert.equal(r.score,76);
 assert.equal(r.level,'high');
 assert.deepEqual(r.components,{sentiment:80,importance:70,impact:65,velocity:90});
});

test('issue risk reacts to evidence velocity changes',()=>{
 const hot=calculateIssueRiskComponents({negativeShare:80,negativeIntensity:80,importance:70,impact:65,velocity:90});
 const cooling=calculateIssueRiskComponents({negativeShare:80,negativeIntensity:80,importance:70,impact:65,velocity:30});
 assert.equal(hot.score,76);
 assert.equal(cooling.score,64);
 assert.ok(hot.score>cooling.score);
});

test('issue risk thresholds stay aligned with article risk',()=>{
 assert.equal(issueRiskLevel(34),'low');
 assert.equal(issueRiskLevel(35),'medium');
 assert.equal(issueRiskLevel(60),'high');
 assert.equal(issueRiskLevel(80),'critical');
});
