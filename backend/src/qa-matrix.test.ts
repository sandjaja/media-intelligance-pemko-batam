import test from 'node:test';
import assert from 'node:assert/strict';

const roleCanWrite = (role: string) => ['admin', 'operator'].includes(role);
const effectiveOpd = (role: string, userOpd: string | null, requested?: string) => role === 'admin' ? requested ?? null : userOpd;

test('QA matrix: admin/operator write, viewer read-only', () => {
  assert.deepEqual(['admin','operator','viewer'].map(roleCanWrite), [true,true,false]);
});

test('QA matrix: OPD scope cannot be overridden by operator/viewer', () => {
  assert.equal(effectiveOpd('operator','12','99'),'12');
  assert.equal(effectiveOpd('viewer','12','99'),'12');
  assert.equal(effectiveOpd('admin',null,'99'),'99');
});
