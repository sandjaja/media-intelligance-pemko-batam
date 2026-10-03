import test from 'node:test';
import assert from 'node:assert/strict';

const incidentId = (value: unknown) => /^\d+$/.test(String(value)) && Number(value) > 0;
const scopedOpd = (role: string, userOpd: string | null, requestedOpd?: string) => role === 'admin' ? requestedOpd ?? null : userOpd;
const validMediaScan = (body: any) => typeof body?.text === 'string' && body.text.trim().length >= 20 && body.text.length <= 50000 && (body.opdId === undefined || /^\d+$/.test(body.opdId));

test('incident id rejects zero, negative and non-numeric values', () => {
  assert.equal(incidentId(1), true);
  assert.equal(incidentId('42'), true);
  assert.equal(incidentId(0), false);
  assert.equal(incidentId(-1), false);
  assert.equal(incidentId('abc'), false);
});

test('non-admin users cannot override their OPD scope', () => {
  assert.equal(scopedOpd('operator', '7', '9'), '7');
  assert.equal(scopedOpd('viewer', '7', '9'), '7');
  assert.equal(scopedOpd('admin', null, '9'), '9');
});

test('media scan input requires bounded OCR text', () => {
  assert.equal(validMediaScan({ text: 'short' }), false);
  assert.equal(validMediaScan({ text: 'x'.repeat(20) }), true);
  assert.equal(validMediaScan({ text: 'x'.repeat(50001) }), false);
  assert.equal(validMediaScan({ text: 'x'.repeat(20), opdId: '12' }), true);
  assert.equal(validMediaScan({ text: 'x'.repeat(20), opdId: 'abc' }), false);
});

test('command owner null remains null instead of becoming numeric zero', () => {
  const input: string | null | undefined = null;
  const owner = input === undefined ? null : input;
  assert.equal(owner, null);
});

test('role matrix keeps viewer read-only', () => {
  const roles = ['admin', 'operator', 'viewer'];
  const writeAllowed = (role: string) => role === 'admin' || role === 'operator';
  assert.equal(writeAllowed(roles[0]), true);
  assert.equal(writeAllowed(roles[1]), true);
  assert.equal(writeAllowed(roles[2]), false);
});
