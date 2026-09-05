import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from './risk.js';

test('negative tier-1 high-impact article becomes critical', () => {
  const result = calculateRisk({ importance: 90, impact: 85, velocity: 90, sentiment: 'negative', tier: 1 });
  assert.equal(result.level, 'critical');
  assert.equal(result.score, 100);
  assert.equal(result.alertType, 'CRITICAL_MEDIA_RISK');
});

test('neutral low-impact article remains low risk', () => {
  const result = calculateRisk({ importance: 20, impact: 20, velocity: 10, sentiment: 'neutral', tier: 3 });
  assert.equal(result.level, 'low');
  assert.equal(result.alertType, null);
});

test('high risk generates actionable reasons', () => {
  const result = calculateRisk({ importance: 70, impact: 65, velocity: 60, sentiment: 'negative', tier: 2 });
  assert.equal(result.level, 'high');
  assert.ok(result.reasons.includes('Sentimen negatif'));
  assert.ok(result.reasons.includes('Dampak publik signifikan'));
  assert.equal(result.alertType, 'HIGH_MEDIA_RISK');
});
