import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCommunicationGapMatch } from './communication-gap-routes.js';

const cluster=(title:string,content='')=>({id:'1',canonical_title:title,representative_title:title,representative_content:content,representative_source:'Media Center Batam',source_names:['Media Center Batam'],member_count:1,channel_count:1,first_published_at:null,last_published_at:null});
const signal=(title:string,summary='',body='')=>({id:'1',title,summary,body_text:body,sentiment:'neutral',risk_score:0,importance_score:0,edition_date:'2026-09-08',source_name:'Koran Batam Pos',opd_id:null,opd_name:null});

test('does not match unrelated road stories only because both contain jalan',()=>{
  const m=evaluateCommunicationGapMatch(
    signal('DIGUYUR HUJAN,','JALAN AHMAD YANI BATAM KEMBALI TERGENANG'),
    cluster('Jalan Tengku Sulung Batam Ditutup Mulai 10 September, Warga Diminta Gunakan Rute Alternatif')
  );
  assert.equal(m.sameIssue,false);
  assert.equal(m.relatedIssue,false);
  assert.ok(m.score<0.62);
});

test('matches APBD 2027 coverage to the official RAPBD 2027 narrative as primary response',()=>{
  const m=evaluateCommunicationGapMatch(
    signal('APBD BATAM 2027 DEFISIT 116 MILIAR','Pemko Batam mengajukan rancangan APBD 2027 dengan belanja lebih besar daripada pendapatan'),
    cluster('DPRD Kota Batam Gelar Paripurna, Wali Kota Amsakar Sampaikan RAPBD 2027 Rp4,86 Triliun')
  );
  assert.equal(m.sameIssue,true);
  assert.equal(m.relatedIssue,false);
  assert.ok(m.anchorTitleCount>=1||m.anchorAllCount>=2);
});

test('classifies PAD narrative as supporting fiscal context for APBD without treating it as the same issue',()=>{
  const m=evaluateCommunicationGapMatch(
    signal('APBD BATAM 2027 DEFISIT 116 MILIAR','Rancangan APBD 2027 mengalami defisit karena belanja lebih besar daripada pendapatan'),
    cluster('PAD Batam Capai Rp2,58 Triliun, Pemko Batam Optimalkan Potensi Ekonomi Daerah')
  );
  assert.equal(m.sameIssue,false);
  assert.equal(m.relatedIssue,true);
  assert.equal(m.matchType,'supporting_related');
  assert.equal(m.relationLabel,'Konteks fiskal APBD/PAD');
});
