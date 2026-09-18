import test from 'node:test';
import assert from 'node:assert/strict';
import { getV16PrimaryEvidenceForInput } from './context-dominance-v16.js';

function fakePool() {
  return {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('FROM taxonomy_categories tc JOIN classification_sectors cs')) {
        return { rows: [{ id: '10', name: 'Infrastruktur Jalan dan Jembatan', sector_name: 'Infrastruktur' }] };
      }
      if (sql.includes('FROM keywords k JOIN keyword_taxonomy kt')) {
        return { rows: [{
          keyword_id: '100', keyword: 'jembatan', evidence_strength: 'DIRECT',
          taxonomy_id: '10', taxonomy_name: 'Infrastruktur Jalan dan Jembatan',
          taxonomy_weight: 5, opd_id: '20', opd_weight: 1,
          opd_name: 'Dinas Infrastruktur', opd_code: 'DI'
        }] };
      }
      if (sql.includes('FROM keyword_opd ko JOIN opd o')) {
        assert.equal(String(params?.[0]), '100');
        return { rows: [{ opd_id: '21' }] };
      }
      throw new Error('Unexpected query in V16.5 regression fixture: ' + sql);
    }
  } as any;
}

test('V16.5 routes physical bridge headline from Master Classification evidence', async () => {
  const result = await getV16PrimaryEvidenceForInput(fakePool(), {
    title: 'Perbaikan jembatan rusak mulai dikerjakan',
    summary: 'Pekerjaan struktur dan akses kendaraan dilakukan bertahap.'
  });
  assert.ok(result);
  assert.equal(result.opdId, '20');
  assert.equal(result.keywordId, '100');
  assert.equal(result.taxonomyId, '10');
  assert.equal(result.matchType, 'TITLE_PHRASE');
  assert.deepEqual(result.supportingOpdIds, ['21']);
});

test('V16.5 rejects figurative bridge use from automatic routing', async () => {
  const result = await getV16PrimaryEvidenceForInput(fakePool(), {
    title: 'Forum warga menjadi jembatan komunikasi masyarakat',
    summary: 'Dialog memperkuat kolaborasi antar pihak.'
  });
  assert.equal(result, null);
});

test('V16.5 preserves manual Master Keyword authority for ambiguous language', async () => {
  const result = await getV16PrimaryEvidenceForInput(fakePool(), {
    title: 'Forum warga menjadi jembatan komunikasi masyarakat',
    summary: 'Operator telah memverifikasi konteks berita.',
    manualKeywordIds: ['100']
  });
  assert.ok(result);
  assert.equal(result.opdId, '20');
  assert.equal(result.matchType, 'MANUAL');
});
