import assert from 'node:assert/strict';
import { incidentScope } from './incident-scope-policy.js';

type Case = { role: 'admin' | 'operator' | 'viewer'; opdId: string | null; requested?: string; target: string | null; allowed: boolean };

const cases: Case[] = [
  { role: 'operator', opdId: '10', target: '10', allowed: true },
  { role: 'operator', opdId: '10', target: '20', allowed: false },
  { role: 'operator', opdId: '10', target: null, allowed: false },
  { role: 'viewer', opdId: '20', target: '10', allowed: false },
  { role: 'admin', opdId: null, target: '10', allowed: true },
  { role: 'admin', opdId: null, requested: '20', target: '10', allowed: false },
  { role: 'admin', opdId: null, requested: '20', target: '20', allowed: true },
];

for (const c of cases) {
  const scope = incidentScope({ role: c.role, opdId: c.opdId }, c.requested);
  const matches = c.target === null ? scope.sql === 'FALSE' : c.target === (scope.params[0] as string | undefined);
  const adminUnfiltered = c.role === 'admin' && !c.requested && scope.sql === 'TRUE';
  const allowed = adminUnfiltered || matches;
  assert.equal(allowed, c.allowed, `${c.role}:${c.opdId}:${c.requested ?? '-'}:${c.target ?? 'null'}`);
}

console.log('incident route scope matrix passed');
