import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIssueAngles } from './issue-angle-extractor.js';
import { matchOfficialResponseCoverage } from './issue-response-coverage.js';

 test('extracts auditable worker demand and handling angles',()=>{
  const r=extractIssueAngles([{id:666,source:'online',title:'Pekerja PT Ghimli menuntut pembayaran gaji',summary:'Keluhan pekerja meminta penyelesaian dan tindak lanjut'}]);
  assert.ok(r.angles.map(x=>x.key).includes('DEMAND_COMPLAINT'));
  assert.ok(r.angles.map(x=>x.key).includes('HANDLING'));
  assert.equal(r.angles.find(x=>x.key==='DEMAND_COMPLAINT')?.evidence[0].id,'666');
 });
 test('extracts haze impact and risk from evidence text',()=>{
  const r=extractIssueAngles([{id:625,source:'print',title:'Kabut asap berdampak pada kualitas udara',body_text:'Kondisi ini berisiko mengganggu aktivitas warga'}]);
  assert.ok(r.angles.map(x=>x.key).includes('IMPACT'));
  assert.ok(r.angles.map(x=>x.key).includes('RISK_THREAT'));
 });
 test('keeps unclear evidence unclassified instead of inventing an angle',()=>{
  const r=extractIssueAngles([{id:1,source:'social',title:'Informasi kegiatan hari ini',content:'Dokumentasi kegiatan bersama masyarakat'}]);
  assert.equal(r.angles.length,0);assert.equal(r.unclassified.length,1);
 });
 test('returns no response when no owned evidence exists',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Pekerja menuntut pembayaran gaji'}]).angles;
  assert.equal(matchOfficialResponseCoverage(angles,[]).status,'NO_RESPONSE');
 });
 test('returns partial response when official content overlaps only part of the external concern',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Pekerja perusahaan menuntut pembayaran gaji dan kepastian jadwal'}]).angles;
  const r=matchOfficialResponseCoverage(angles,[{id:10,title:'Pemko membahas pembayaran pekerja',content:'Pembayaran pekerja sedang dibahas bersama perusahaan'}]);
  assert.ok(['PARTIAL_RESPONSE','NO_RESPONSE'].includes(r.status));
  assert.notEqual(r.status,'ADDRESSED');
 });
 test('returns addressed only when all extracted angles have strong official coverage',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Warga mengeluhkan gangguan drainase'}]).angles;
  const r=matchOfficialResponseCoverage(angles,[{id:10,title:'Keluhan gangguan drainase ditangani',content:'Keluhan gangguan drainase warga sedang ditangani'}]);
  assert.equal(r.status,'ADDRESSED');
 });
 test('returns unassessed when no reliable external angle exists',()=>{
  assert.equal(matchOfficialResponseCoverage([],[]).status,'UNASSESSED');
 });

 test('recognizes substantive haze mitigation response without requiring identical wording',()=>{
  const angles=extractIssueAngles([{id:625,source:'online',title:'Kabut asap berdampak pada kualitas udara dan mengganggu aktivitas warga',summary:'Kualitas udara tidak sehat akibat kabut asap, warga mengalami gangguan pernapasan'}]).angles;
  const r=matchOfficialResponseCoverage(angles,[{id:194,title:'Kabut Asap Melanda Batam, Berikut Imbauan Pemerintah',content:'Masyarakat diimbau mengurangi aktivitas di luar ruangan, menggunakan masker, memperbanyak minum air putih, memeriksakan gangguan pernapasan dan menghindari pembakaran sampah maupun lahan.'}]);
  assert.notEqual(r.status,'NO_RESPONSE');
  assert.ok(r.coverage.some(x=>x.status==='PARTIAL'||x.status==='COVERED'));
 });

 test('worker evidence exposes payment complaint and handling concerns beyond timing alone',()=>{
  const r=extractIssueAngles([
   {id:569,source:'online',title:'Pekerja PT Ghim Li suarakan nasib gaji satu bulan belum dibayar',summary:'Pekerja datang mengadu kepada pemerintah karena upah belum dibayarkan'},
   {id:688,source:'online',title:'DPRD soroti tanggung jawab dan perlindungan pekerja',summary:'Belum jelas pihak yang bertanggung jawab terhadap hak pekerja dan pesangon'}
  ]);
  const keys=r.angles.map(x=>x.key);
  assert.ok(keys.includes('DEMAND_COMPLAINT'));
  assert.ok(keys.includes('TIMING_CERTAINTY'));
 });
 test('haze evidence exposes health impact and disruption without requiring generic complaint wording',()=>{
  const r=extractIssueAngles([
   {id:625,source:'online',title:'Kualitas Udara Batam Tak Sehat, Siswa Belajar dari Rumah'},
   {id:737,source:'online',title:'Kualitas Udara Batam Mulai Membaik',summary:'Kasus ISPA mencapai 517 kasus dan warga diminta waspada saat beraktivitas di luar ruangan'}
  ]);
  const keys=r.angles.map(x=>x.key);
  assert.ok(keys.includes('IMPACT'));
  assert.ok(keys.includes('DISRUPTION'));
  assert.ok(!keys.includes('TARGET_PROGRESS'));
  assert.ok(!keys.includes('DEMAND_COMPLAINT'));
 });
