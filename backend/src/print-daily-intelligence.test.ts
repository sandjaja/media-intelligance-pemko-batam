import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrintScan } from './print-daily-intelligence.js';

test('print scan uses database OPD name and edition date', () => {
  const row = normalizePrintScan({
    id: 17,
    file_name: 'koran-5-september.jpg',
    ocr_text: 'Pelayanan Dinas Kesehatan Kota Batam menjadi sorotan karena keluhan warga.',
    created_at: '2026-09-05T03:00:00Z',
    opd_id: 5,
    opd_name: 'Dinas Kesehatan',
    analysis: {
      headline: 'Pelayanan kesehatan menjadi sorotan',
      summary: 'Keluhan warga mengenai pelayanan.',
      media_name: 'Media Batam',
      edition_date: '2026-09-05',
      sentiment: 'negative',
      risk_score: 72,
      risk_level: 'high',
      impact_score: 81,
      velocity_score: 30,
      importance_score: 85
    }
  });
  assert.equal(row.id, 'print-17');
  assert.equal(row.source_name, 'Media Batam');
  assert.equal(row.published_at, '2026-09-05');
  assert.equal(row.opd_id, 5);
  assert.equal(row.opd_name, 'Dinas Kesehatan');
  assert.equal(row.media_kind, 'print');
  assert.equal(row.risk_level, 'high');
});
