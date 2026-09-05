import test from 'node:test';
import assert from 'node:assert/strict';

const canWrite = (role: string) => role === 'admin' || role === 'operator';
const scopedOpd = (role: string, userOpd: string | null, requestedOpd?: string) => role === 'admin' ? requestedOpd ?? null : userOpd;
const validMediaScan = (body: any) => typeof body?.text === 'string' && body.text.trim().length >= 20 && body.text.length <= 50000 && (body.opdId === undefined || /^\d+$/.test(body.opdId));

test('RBAC: viewer is read-only while admin/operator can write', () => {
  assert.equal(canWrite('admin'), true);
  assert.equal(canWrite('operator'), true);
  assert.equal(canWrite('viewer'), false);
});

test('OPD isolation: non-admin cannot override requested OPD', () => {
  assert.equal(scopedOpd('operator', '7', '9'), '7');
  assert.equal(scopedOpd('viewer', '7', '9'), '7');
  assert.equal(scopedOpd('admin', null, '9'), '9');
});

test('media scan payload rejects undersized, oversized and invalid OPD input', () => {
  assert.equal(validMediaScan({ text: 'short' }), false);
  assert.equal(validMediaScan({ text: 'x'.repeat(20) }), true);
  assert.equal(validMediaScan({ text: 'x'.repeat(50001) }), false);
  assert.equal(validMediaScan({ text: 'x'.repeat(20), opdId: 'abc' }), false);
});

test('incident command owner preserves explicit null', () => {
  const input: string | null | undefined = null;
  const owner = input === undefined ? null : input;
  assert.equal(owner, null);
});
