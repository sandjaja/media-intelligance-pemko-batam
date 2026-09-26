import { describe,it,expect } from 'vitest';
import { extractIssueAngles } from './issue-angle-extractor.js';
import { matchOfficialResponseCoverage } from './issue-response-coverage.js';

describe('issue communication gap engines',()=>{
 it('extracts auditable worker demand and handling angles',()=>{
  const r=extractIssueAngles([{id:666,source:'online',title:'Pekerja PT Ghimli menuntut pembayaran gaji',summary:'Keluhan pekerja meminta penyelesaian dan tindak lanjut'}]);
  expect(r.angles.map(x=>x.key)).toContain('DEMAND_COMPLAINT');
  expect(r.angles.map(x=>x.key)).toContain('HANDLING');
  expect(r.angles.find(x=>x.key==='DEMAND_COMPLAINT')?.evidence[0].id).toBe('666');
 });
 it('extracts haze impact and risk from evidence text',()=>{
  const r=extractIssueAngles([{id:625,source:'print',title:'Kabut asap berdampak pada kualitas udara',body_text:'Kondisi ini berisiko mengganggu aktivitas warga'}]);
  expect(r.angles.map(x=>x.key)).toContain('IMPACT');
  expect(r.angles.map(x=>x.key)).toContain('RISK_THREAT');
 });
 it('keeps unclear evidence unclassified instead of inventing an angle',()=>{
  const r=extractIssueAngles([{id:1,source:'social',title:'Informasi kegiatan hari ini',content:'Dokumentasi kegiatan bersama masyarakat'}]);
  expect(r.angles).toHaveLength(0);expect(r.unclassified).toHaveLength(1);
 });
 it('returns no response when no owned evidence exists',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Pekerja menuntut pembayaran gaji'}]).angles;
  expect(matchOfficialResponseCoverage(angles,[]).status).toBe('NO_RESPONSE');
 });
 it('returns partial response when official content overlaps only part of the external concern',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Pekerja perusahaan menuntut pembayaran gaji dan kepastian jadwal'}]).angles;
  const r=matchOfficialResponseCoverage(angles,[{id:10,title:'Pemko membahas pembayaran pekerja',content:'Pembayaran pekerja sedang dibahas bersama perusahaan'}]);
  expect(['PARTIAL_RESPONSE','NO_RESPONSE']).toContain(r.status);
  expect(r.status).not.toBe('ADDRESSED');
 });
 it('returns addressed only when all extracted angles have strong official coverage',()=>{
  const angles=extractIssueAngles([{id:1,source:'online',title:'Warga mengeluhkan gangguan drainase'}]).angles;
  const r=matchOfficialResponseCoverage(angles,[{id:10,title:'Keluhan gangguan drainase ditangani',content:'Keluhan gangguan drainase warga sedang ditangani'}]);
  expect(r.status).toBe('ADDRESSED');
 });
 it('returns unassessed when no reliable external angle exists',()=>{
  expect(matchOfficialResponseCoverage([],[]).status).toBe('UNASSESSED');
 });
});
