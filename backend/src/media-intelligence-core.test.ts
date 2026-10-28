import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeArticle, detectDuplicates, matchesKeywordQuery, parseKeywordQuery, rankDailyHighlights, topNarrativeTerms } from './media-intelligence-core.js';
import { calculateRisk } from './risk.js';

test('keyword query supports AND OR NOT and exact phrase', () => {
  const query = parseKeywordQuery('banjir Metro "Pemerintah Kota Metro" macet|protes -hoaks');
  assert.deepEqual(query.and, ['banjir', 'Metro']);
  assert.deepEqual(query.or, ['macet', 'protes']);
  assert.deepEqual(query.not, ['hoaks']);
  assert.deepEqual(query.exact, ['Pemerintah Kota Metro']);
  assert.equal(matchesKeywordQuery({ id: 1, title: 'Pemerintah Kota Metro tangani banjir Metro', content: 'protes warga' }, query), true);
  assert.equal(matchesKeywordQuery({ id: 2, title: 'Pemerintah Kota Metro tangani banjir Metro', content: 'hoaks protes warga' }, query), false);
});

test('analysis produces sentiment, impact and duplicate fingerprint; shared engine produces final risk', () => {
  const article = { id: 1, title: 'Korupsi dan sengketa proyek pemerintah kota', summary: 'Keluhan warga meningkat dan terjadi keterlambatan.', sourceName: 'Media A', sourceTier: 1, mediaKind: 'online' as const };
  const analysis = analyzeArticle(article, parseKeywordQuery('korupsi Metro'), 5);
  assert.equal(analysis.sentiment, 'negative');
  assert.ok(analysis.impactScore > 0);
  const risk=calculateRisk({sentiment:analysis.sentiment,importance:analysis.importanceScore,impact:analysis.impactScore,velocity:analysis.velocityScore});
  assert.ok(risk.score >= 35);
  assert.equal(analysis.matchedKeywords.includes('korupsi'), true);
  assert.ok(analysis.duplicateFingerprint.length > 0);
});

test('duplicate detection groups syndicated-like headlines', () => {
  const articles = [
    { id: 1, title: 'Pemerintah Kota Metro buka layanan baru', sourceName: 'A' },
    { id: 2, title: 'Layanan baru buka Pemerintah Kota Metro', sourceName: 'B' },
    { id: 3, title: 'Festival budaya Metro dimulai', sourceName: 'C' }
  ];
  const groups = detectDuplicates(articles);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].articles.length, 2);
});

test('daily highlights rank high-risk high-impact stories', () => {
  const articles = [
    { id: 1, title: 'Prestasi pemerintah kota', summary: 'penghargaan dan inovasi' },
    { id: 2, title: 'Korupsi proyek dan krisis layanan', summary: 'keluhan warga dan sengketa' }
  ];
  const analyses = articles.map(article => analyzeArticle(article, parseKeywordQuery('Metro'), 8));
  const ranked = rankDailyHighlights(articles, analyses);
  assert.equal(ranked[0].article.id, 2);
});

test('narrative terms ignore common stopwords', () => {
  const terms = topNarrativeTerms([
    { id: 1, title: 'Pemerintah Kota Metro tingkatkan pelayanan publik' },
    { id: 2, title: 'Pelayanan publik Metro meningkat' }
  ], 5);
  assert.equal(terms.some(item => item.term === 'pelayanan'), true);
  assert.equal(terms.some(item => item.term === 'yang'), false);
});


test('semantic scoring keeps routine news below disruptive public-safety events', () => {
  const routine=analyzeArticle({id:10,title:'Pemko gelar rapat koordinasi rutin',summary:'Rapat internal membahas agenda administrasi.'},parseKeywordQuery(''),1);
  const flood=analyzeArticle({id:11,title:'Banjir merendam permukiman dan jalan, layanan warga terganggu',summary:'Warga terdampak, akses jalan terhambat dan petugas melakukan evakuasi.'},parseKeywordQuery(''),1);
  assert.ok(flood.impactScore >= 55);
  assert.ok(flood.impactScore > routine.impactScore);
  assert.ok(flood.importanceScore > routine.importanceScore);
});

test('public service accountability can cross importance threshold without source tier', () => {
  const analysis=analyzeArticle({id:12,title:'Warga keluhkan pelayanan publik Pemko yang terlambat',summary:'Keluhan masyarakat meminta dinas memperbaiki layanan.'},parseKeywordQuery(''),1);
  assert.ok(analysis.importanceScore >= 65);
  assert.equal(analysis.sentiment,'negative');
  assert.ok(analysis.riskScore > 0);
});

test('fire and safety impact are semantic rather than headline-length based', () => {
  const analysis=analyzeArticle({id:13,title:'Polisi tetapkan tersangka kebakaran lahan',summary:'Kebakaran lahan mengancam keselamatan warga dan lingkungan.'},parseKeywordQuery(''),1);
  assert.ok(analysis.impactScore >= 55);
  assert.ok(analysis.riskScore > 0);
});
