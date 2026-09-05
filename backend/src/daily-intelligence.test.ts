import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDailyIntelligence } from './daily-intelligence.js';

function mockPool(rows: any[]) {
  const calls: any[] = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT a.id')) return { rows };
      return { rows: [] };
    }
  } as any;
}

test('daily intelligence ranks high-risk negative issue and persists payload', async () => {
  const pool = mockPool([
    { id:'1', title:'Pemko menghadapi kritik layanan dan keterlambatan', summary:'keluhan warga', content:'masalah layanan terlambat', url:'https://example.test/1', published_at:'2026-09-05T01:00:00Z', sentiment:'negative', risk_score:75, risk_level:'high', impact_score:80, velocity_score:70, importance_score:82, source_name:'Media A', source_tier:1, media_kind:'online', opd_name:'Diskominfo' },
    { id:'2', title:'Pemko raih penghargaan inovasi pelayanan', summary:'prestasi', content:'berhasil dan apresiasi', url:'https://example.test/2', published_at:'2026-09-05T02:00:00Z', sentiment:'positive', risk_score:10, risk_level:'low', impact_score:55, velocity_score:20, importance_score:45, source_name:'Media B', source_tier:2, media_kind:'online', opd_name:'Diskominfo' }
  ]);
  const result = await generateDailyIntelligence(pool, '2026-09-05');
  assert.equal(result.date, '2026-09-05');
  assert.equal(result.metrics.totalArticles, 2);
  assert.equal(result.metrics.negativeCount, 1);
  assert.equal(result.status, 'ESCALATING');
  assert.equal(result.responseWindow, '1–6 JAM');
  assert.equal(result.dailyHighlight?.id, '1');
  assert.equal(result.topNegative[0]?.id, '1');
  assert.equal(result.topMedia?.name, 'Media A');
  assert.ok(pool.calls.some(c => c.sql.includes('INSERT INTO daily_intelligence_runs')));
});

test('empty day returns normal monitoring state', async () => {
  const pool = mockPool([]);
  const result = await generateDailyIntelligence(pool, '2026-09-05');
  assert.equal(result.status, 'NORMAL');
  assert.equal(result.metrics.totalArticles, 0);
  assert.equal(result.dailyHighlight, null);
  assert.match(result.executiveBrief, /Belum ada pemberitaan/);
});
