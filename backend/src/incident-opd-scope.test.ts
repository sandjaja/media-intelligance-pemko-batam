import assert from 'node:assert/strict';

/**
 * Regression contracts for incident OPD isolation.
 * These helpers mirror the SQL invariant expected by server incident routes:
 * non-admin users must only resolve an incident when incident.opd_id matches
 * their authenticated opdId; admins may optionally constrain by a requested OPD.
 */

type User = { role: 'admin' | 'operator' | 'viewer'; opdId: string | null };

function incidentScope(user: User, incidentOpdId: string | null, requestedOpdId?: string) {
  if (user.role === 'admin') return !requestedOpdId || incidentOpdId === requestedOpdId;
  return incidentOpdId !== null && incidentOpdId === user.opdId;
}

assert.equal(incidentScope({ role: 'operator', opdId: '1' }, '1'), true);
assert.equal(incidentScope({ role: 'operator', opdId: '1' }, '2'), false);
assert.equal(incidentScope({ role: 'operator', opdId: '1' }, null), false);
assert.equal(incidentScope({ role: 'viewer', opdId: '2' }, '1'), false);
assert.equal(incidentScope({ role: 'admin', opdId: null }, '1'), true);
assert.equal(incidentScope({ role: 'admin', opdId: null }, '2', '1'), false);
assert.equal(incidentScope({ role: 'admin', opdId: null }, '1', '1'), true);

console.log('incident OPD scope contracts passed');
