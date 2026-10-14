import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from './risk.js';

test('negative high-importance high-impact high-velocity article becomes critical', () => {
  const result = calculateRisk({ importance: 90, impact: 85, velocity: 90, sentiment: 'negative' });
  assert.equal(result.level, 'critical');
  assert.equal(result.score, 92);
  assert.equal(result.alertType, 'CRITICAL_MEDIA_RISK');
});

test('neutral low-impact article remains low risk', () => {
  const result = calculateRisk({ importance: 20, impact: 20, velocity: 10, sentiment: 'neutral' });
  assert.equal(result.level, 'low');
  assert.equal(result.alertType, null);
});

test('high risk generates actionable reasons', () => {
  const result = calculateRisk({ importance: 70, impact: 65, velocity: 60, sentiment: 'negative' });
  assert.equal(result.level, 'high');
  assert.ok(result.reasons.some(x => x.startsWith('Sentimen negatif +')));
  assert.ok(result.reasons.some(x => x.startsWith('Dampak publik +')));
  assert.equal(result.alertType, 'HIGH_MEDIA_RISK');
});
