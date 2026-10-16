import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBrief } from './executive-brief-daily.js';

const valid = {
  mode: 'ai', headline: 'Situasi Kota', situation: 'Sinyal pemberitaan terpantau',
  implications: 'Perlu verifikasi', actions: ['Validasi data'],
  key_message: 'Informasi resmi menyusul', priority: 'WATCH',
};

test('Executive Brief: complete AI result is eligible for storage', () => {
  assert.equal(isValidBrief(valid), true);
});

test('Executive Brief: malformed Gemini response must not be marked ready', () => {
  assert.equal(isValidBrief({ ...valid, actions: [] }), false);
  assert.equal(isValidBrief({ ...valid, headline: '' }), false);
  assert.equal(isValidBrief({ ...valid, priority: 'UNKNOWN' }), false);
  assert.equal(isValidBrief({ ...valid, situation: null }), false);
});
