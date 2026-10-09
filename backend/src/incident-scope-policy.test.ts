import assert from 'node:assert/strict';
import { incidentScope } from './incident-scope-policy.js';

assert.deepEqual(incidentScope({ role: 'operator', opdId: '1' }), { sql: 'i.opd_id=$1', params: ['1'] });
assert.deepEqual(incidentScope({ role: 'viewer', opdId: '2' }), { sql: 'i.opd_id=$1', params: ['2'] });
assert.deepEqual(incidentScope({ role: 'operator', opdId: null }), { sql: 'FALSE', params: [] });
assert.deepEqual(incidentScope({ role: 'admin', opdId: null }), { sql: 'TRUE', params: [] });
assert.deepEqual(incidentScope({ role: 'admin', opdId: null }, '3'), { sql: 'i.opd_id=$1', params: ['3'] });
console.log('centralized incident scope policy passed');
