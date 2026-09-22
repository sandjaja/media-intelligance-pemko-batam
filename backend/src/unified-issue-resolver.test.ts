import test from 'node:test';
import assert from 'node:assert/strict';
import { CANDIDATE_THRESHOLD, candidateSimilarity, entityAnchors } from './unified-candidate-issues.js';

const candidate=(title:string,summary='',opdId:number|null=null,score=70)=>({
  candidateKey:title,
  score,
  evidence:[{sourceType:'online',id:1,title,summary,opdId,importanceScore:40}],
  sourceTypes:['online']
});

test('candidate threshold remains explicit and stable',()=>assert.equal(CANDIDATE_THRESHOLD,60));

test('PT Ghim Li entity anchor survives wording differences',()=>{
  const a=candidate('Persoalan pekerja PT Ghim Li Batam','Keluhan karyawan perusahaan',12);
  const b=candidate('PT Ghim Li bahas penyelesaian pekerja','Pertemuan membahas karyawan',12);
  assert.deepEqual([...entityAnchors(a)],[...entityAnchors(b)]);
  assert.ok(candidateSimilarity(a,b)>=80);
});

test('kabut asap topic can match across media when topic anchors agree',()=>{
  const a=candidate('Kabut asap mengganggu aktivitas warga','Kabut asap mulai menurunkan jarak pandang',8);
  const b={...candidate('Pemko pantau dampak kabut asap','Penanganan kabut asap dan jarak pandang',8),evidence:[{sourceType:'print',id:2,title:'Pemko pantau dampak kabut asap',summary:'Penanganan kabut asap dan jarak pandang',opdId:8,importanceScore:40}]};
  assert.ok(candidateSimilarity(a,b)>=70);
});

test('generic Pemkot wording alone is noise for candidate matching',()=>{
  const a=candidate('Pemkot meningkatkan pelayanan publik','Program pelayanan masyarakat',null);
  const b=candidate('Pemkot daerah lain meningkatkan pelayanan publik','Program pelayanan masyarakat',null);
  assert.equal(candidateSimilarity(a,b),0);
});

test('different strategic topics do not merge merely because OPD is same',()=>{
  const a=candidate('Kabut asap mengganggu jarak pandang','Kualitas udara menurun',8);
  const b=candidate('Pengelolaan sampah diperkuat','Armada kebersihan ditambah',8);
  assert.equal(candidateSimilarity(a,b),0);
});
