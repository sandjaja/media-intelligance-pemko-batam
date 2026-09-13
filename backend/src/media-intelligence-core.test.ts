import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeArticle, detectDuplicates, matchesKeywordQuery, parseKeywordQuery, rankDailyHighlights, topNarrativeTerms } from './media-intelligence-core.js';

test('keyword query supports AND OR NOT and exact phrase', () => {
  const query = parseKeywordQuery('banjir Batam "Pemko Batam" macet|protes -hoaks');
  assert.deepEqual(query.and, ['banjir', 'Batam']);
  assert.deepEqual(query.or, ['macet', 'protes']);
  assert.deepEqual(query.not, ['hoaks']);
  assert.deepEqual(query.exact, ['Pemko Batam']);
  assert.equal(matchesKeywordQuery({ id: 1, title: 'Pemko Batam tangani banjir Batam', content: 'protes warga' }, query), true);
  assert.equal(matchesKeywordQuery({ id: 2, title: 'Pemko Batam tangani banjir Batam', content: 'hoaks protes warga' }, query), false);
});

test('analysis produces sentiment, risk, impact and duplicate fingerprint', () => {
  const article = { id: 1, title: 'Korupsi dan sengketa proyek Pemko Batam', summary: 'Keluhan warga meningkat dan terjadi keterlambatan.', sourceName: 'Media A', sourceTier: 1, mediaKind: 'online' as const };
  const analysis = analyzeArticle(article, parseKeywordQuery('korupsi Batam'), 5);
  assert.equal(analysis.sentiment, 'negative');
  assert.ok(analysis.riskScore >= 35);
  assert.ok(analysis.impactScore > 0);
  assert.equal(analysis.matchedKeywords.includes('korupsi'), true);
  assert.ok(analysis.duplicateFingerprint.length > 0);
});

test('duplicate detection groups syndicated-like headlines', () => {
  const articles = [
    { id: 1, title: 'Pemko Batam buka layanan baru', sourceName: 'A' },
    { id: 2, title: 'Layanan baru buka Pemko Batam', sourceName: 'B' },
    { id: 3, title: 'Festival budaya Batam dimulai', sourceName: 'C' }
  ];
  const groups = detectDuplicates(articles);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].articles.length, 2);
});

test('daily highlights rank high-risk high-impact stories', () => {
  const articles = [
    { id: 1, title: 'Prestasi Pemko Batam', summary: 'penghargaan dan inovasi' },
    { id: 2, title: 'Korupsi proyek dan krisis layanan', summary: 'keluhan warga dan sengketa' }
  ];
  const analyses = articles.map(article => analyzeArticle(article, parseKeywordQuery('Batam'), 8));
  const ranked = rankDailyHighlights(articles, analyses);
  assert.equal(ranked[0].article.id, 2);
});

test('narrative terms ignore common stopwords', () => {
  const terms = topNarrativeTerms([
    { id: 1, title: 'Pemko Batam tingkatkan pelayanan publik' },
    { id: 2, title: 'Pelayanan publik Batam meningkat' }
  ], 5);
  assert.equal(terms.some(item => item.term === 'pelayanan'), true);
  assert.equal(terms.some(item => item.term === 'yang'), false);
});
