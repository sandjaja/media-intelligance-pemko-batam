import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { Pool } from 'pg';
import type { AuthorizationContext } from './rbac.js';
import { answerTelegramAsk, telegramAskIntent } from './telegram-ask-intelligence.js';
import { registerNotificationPairingRoutes } from './notification-pairing-routes.js';
import { encryptIntegrationCredential } from './integration-credentials.js';
const originalFetch=globalThis.fetch,originalKey=process.env.INTEGRATION_CREDENTIAL_KEY;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=originalKey;});
const user=(role='humas'):AuthorizationContext=>({id:'2',email:'test@example.invalid',legacyRole:'operator',opdId:role==='opd'?'7':null,districtId:role==='district'?'8':null,active:true,roles:[role as any],permissions:[]});
function db(rows:any[]=[],options:{linked?:boolean;active?:boolean;role?:string;channelStatus?:string}={}){
 const queries:{sql:string;params:any[]}[]=[];
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-telegram-key';
 const ciphertext=encryptIntegrationCredential(JSON.stringify({botToken:'test-bot-token',webhookSecret:'test-secret'}));
 const query=async(sql:string,params:any[]=[])=>{
  queries.push({sql,params});const result=(rows:any[])=>({rows,rowCount:rows.length});
  if(sql.includes('FROM notification_channels'))return result([{status:options.channelStatus||'ACTIVE',settings:{botUsername:'TestBot'},credential_ciphertext:ciphertext}]);
  if(sql.includes('SELECT user_id FROM user_notification_channels')){assert.deepEqual(params,['123','123']);assert.match(sql,/enabled=TRUE AND verified_at IS NOT NULL/);return result(options.linked===false?[]:[{user_id:2}]);}
  if(sql.includes('FROM users u')){const u=user(options.role);return result([{id:u.id,email:u.email,role:u.legacyRole,opd_id:u.opdId,district_id:u.districtId,active:options.active!==false,roles:u.roles,permissions:[]}]);}
  if(sql.startsWith('SELECT organization_id'))return result([{organization_id:1}]);
  if(sql.startsWith('SELECT id FROM organizations'))return result([{id:1}]);
  if(sql.startsWith('SELECT id,code,name FROM opd'))return result([{id:'7',code:'DINAS_A',name:'Dinas A'},{id:'9',code:'DINAS_B',name:'Dinas B'}]);
  if(sql.startsWith('SELECT id,code,name FROM districts'))return result([{id:'8',code:'BATAM_KOTA',name:'Batam Kota'},{id:'10',code:'SAGULUNG',name:'Sagulung'}]);
  if(sql.startsWith('WITH trusted')||sql.includes('FROM issues i'))return result(rows);
  throw Error('Unexpected SQL: '+sql);
 };
 return{pool:{query} as unknown as Pool,queries};
}

test('Telegram recognizes operational questions and Jakarta periods without an LLM',()=>{
 for(const [q,domain] of [['Berapa berita negatif kemarin?','news'],['Apa isu berisiko tinggi?','issue'],['Bagaimana status isu sampah?','issue'],['Strakom MTQ sudah disetujui?','strategy'],['Klarifikasi apa yang belum selesai?','clarification'],['Publikasi isu MTQ','publication'],['Monitoring isu sampah','monitoring']])assert.equal(telegramAskIntent(q).domain,domain);
 assert.equal(telegramAskIntent('berita minggu lalu').period,'last_week');assert.equal(telegramAskIntent('berita bulan lalu').period,'last_month');
 assert.equal(telegramAskIntent('hapus seluruh data').domain,null);
});

test('news uses validated sources, exact window totals and Jakarta yesterday; no AI or write queries',async()=>{
 const x=db([{title:'Berita terverifikasi',channel:'online',risk_score:80,total:137}]);let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No outbound calls allowed');};
 const text=await answerTelegramAsk(x.pool,user(),'Berapa berita negatif kemarin?');assert.match(text,/137/);assert.match(text,/tanpa AI/);assert.equal(calls,0);
 assert.match(text,/Waktu: \d{2}[.:]\d{2} WIB\./);
 const q=x.queries.at(-1)!;assert.match(q.sql,/Asia\/Jakarta/);assert.match(q.sql,/::date-1/);assert.match(q.sql,/COUNT\(\*\) OVER/);assert.match(q.sql,/ARTICLE_CLASSIFICATION_VERIFIED/);assert.match(q.sql,/keywordVerification/);assert.match(q.sql,/socialVerification/);assert.ok(!x.queries.some(q=>/INSERT|UPDATE|DELETE|ai_provider|ai_usage|ai_free_tier/.test(q.sql)));
 assert.deepEqual(q.params,[1,'negative']);
});
for(const role of ['humas','executive','opd','district'])test(`${role} operational query always preserves organization and role scope`,async()=>{
 const x=db([{id:21,title:'Sampah',status:'active',risk_level:'high',cycle_number:1,total:1}]);
 const text=await answerTelegramAsk(x.pool,user(role),'Bagaimana status isu sampah?');assert.match(text,/Sampah/);
 assert.match(text,new RegExp('Akses: '+({humas:'Humas',executive:'Executive',opd:'OPD',district:'Kecamatan'} as Record<string,string>)[role]));
 if(role==='humas'||role==='executive')assert.doesNotMatch(text,/Scope:/);
 if(role==='opd')assert.match(text,/Scope: Dinas A\./);
 if(role==='district')assert.match(text,/Scope: Batam Kota\./);
 const q=x.queries.at(-1)!;assert.match(q.sql,/i.organization_id=\$1/);assert.equal(q.params[0],1);assert.match(q.sql,/i.title ILIKE/);
 if(role==='opd'){assert.ok(q.params.includes('7'));assert.match(q.sql,/io.opd_id=\$2/);}
 if(role==='district'){assert.ok(q.params.includes('8'));assert.match(q.sql,/d.district_id=\$2/);}
});
test('global access shows scope only when the question names an OPD or kecamatan',async()=>{
 const x=db([{id:21,title:'Sampah',status:'active',risk_level:'high',cycle_number:1,total:1}]);
 const opd=await answerTelegramAsk(x.pool,user('humas'),'Berapa isu di Dinas A?');
 assert.match(opd,/Akses: Humas\. Scope: Dinas A\./);
 const district=await answerTelegramAsk(x.pool,user('executive'),'Berapa isu di Batam Kota?');
 assert.match(district,/Akses: Executive\. Scope: Batam Kota\./);
});
test('out-of-scope unit requests and viewer accounts never run an operational query',async()=>{
 for(const [role,question]of [['opd','Berita Dinas B kemarin'],['district','Berita Sagulung kemarin'],['viewer','Apa isu aktif?']]){
  const x=db();const text=await answerTelegramAsk(x.pool,user(role),question);assert.match(text,/di luar|tidak tersedia/);assert.ok(!x.queries.some(q=>q.sql.startsWith('WITH trusted')||q.sql.includes('FROM issues i')));
 }
});
test('pending clarification and approved strategy use saved status only',async()=>{
 const x=db();await answerTelegramAsk(x.pool,user(),'Klarifikasi apa yang belum selesai?');assert.match(x.queries.at(-1)!.sql,/ASSIGNED','REVISION_REQUIRED/);
 await answerTelegramAsk(x.pool,user('executive'),'Strakom MTQ sudah disetujui?');assert.match(x.queries.at(-1)!.sql,/cs.status='APPROVED'/);assert.ok(!x.queries.some(q=>/ai_provider|ai_free_tier|INSERT INTO/.test(q.sql)));
});

async function webhook(options:Parameters<typeof db>[1]={},input:{secret?:string;type?:string;text?:string;sendFails?:boolean}={}){
 const x=db([{title:'Sampah',status:'active',risk_level:'high',cycle_number:1,total:1}],options),sent:any[]=[];
 globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.telegram.org/bottest-bot-token/sendMessage');sent.push(JSON.parse(String(init?.body)));return Response.json({ok:!input.sendFails},{status:input.sendFails?503:200});};
 const app=Fastify();await app.register(cookie);await registerNotificationPairingRoutes(app,x.pool,'test-jwt');
 const r=await app.inject({method:'POST',url:'/api/notifications/telegram/webhook',headers:{'x-telegram-bot-api-secret-token':input.secret??'test-secret'},payload:{update_id:123,message:{chat:{id:123,type:input.type||'private'},from:{id:123},text:input.text??'/tanya Bagaimana status isu sampah?'}}});await app.close();return{x,sent,r};
}
test('paired user can ask a plain question or /tanya and receives a private database-only answer',async()=>{
 for(const text of ['/tanya Bagaimana status isu sampah?','Bagaimana status isu sampah?']){
  const {r,sent}=await webhook({}, {text});assert.equal(r.statusCode,200,r.body);assert.equal(sent.length,1);assert.equal(sent[0].chat_id,'123');assert.match(sent[0].text,/Sampah/);assert.match(sent[0].text,/tanpa AI/);assert.equal(sent[0].parse_mode,undefined);
 }
});
test('invalid secret, unpaired, inactive, disabled channel and group requests cannot retrieve data',async()=>{
 const bad=await webhook({}, {secret:'wrong'});assert.equal(bad.r.statusCode,401);assert.equal(bad.sent.length,0);
 for(const [options,input]of [[{linked:false},{}],[{active:false},{}],[{channelStatus:'INACTIVE'},{}],[{},{type:'group'}]] as const){const {x,sent,r}=await webhook(options,input);assert.equal(r.statusCode,200,r.body);assert.equal(sent.length,1);assert.ok(!x.queries.some(q=>q.sql.includes('FROM issues i')));}
});
test('help is available and failed Telegram sends permit a webhook retry',async()=>{
 const help=await webhook({}, {text:'/bantuan'});assert.equal(help.r.statusCode,200);assert.match(help.sent[0].text,/Contoh/);assert.ok(!help.x.queries.some(q=>q.sql.includes('FROM issues i')));
 const failed=await webhook({}, {sendFails:true});assert.equal(failed.r.statusCode,503);assert.equal(failed.r.json().error,'TELEGRAM_SEND_FAILED');
});

test('write and reanalysis requests are refused before querying data or calling Telegram/AI',async()=>{
 for(const question of ['Hapus isu sampah','Jalankan analisis ulang isu MTQ','Setujui strakom MTQ']){
  const x=db();const text=await answerTelegramAsk(x.pool,user(),question);assert.match(text,/hanya membaca/);assert.equal(x.queries.length,0);
 }
});
for(const role of ['opd','district'])test(`${role} news cannot escape its fixed unit/wilayah through question text`,async()=>{
 const x=db();await answerTelegramAsk(x.pool,user(role),'Berapa berita negatif kemarin?');const q=x.queries.at(-1)!;
 assert.equal(q.params[0],1);assert.ok(q.params.includes(role==='opd'?'7':'8'));
 for(const alias of ['a','pa','sm'])assert.ok(q.sql.includes(alias+'.'+(role==='opd'?'opd_id':'district_id')+'=$2'));
});

test('existing /connect pairing still commits and sends its confirmation',async()=>{
 const x=db(),queries:string[]=[],sent:any[]=[];
 const pool={query:x.pool.query.bind(x.pool),connect:async()=>({query:async(sql:string)=>{queries.push(sql);if(sql.includes('FROM notification_link_tokens'))return{rows:[{id:1,user_id:2}]};return{rows:[]};},release(){}})} as unknown as Pool;
 globalThis.fetch=async(url,init)=>{assert.ok(String(url).startsWith('https://api.telegram.org/'));sent.push(JSON.parse(String(init?.body)));return Response.json({ok:true});};
 const app=Fastify();await app.register(cookie);await registerNotificationPairingRoutes(app,pool,'test-jwt');
 try{const r=await app.inject({method:'POST',url:'/api/notifications/telegram/webhook',headers:{'x-telegram-bot-api-secret-token':'test-secret'},payload:{message:{chat:{id:123,type:'private'},from:{id:123,first_name:'Pengguna'},text:'/connect AABBCCDDEEFF'}}});assert.equal(r.statusCode,200,r.body);assert.ok(queries.includes('COMMIT'));assert.ok(queries.some(q=>q.includes('INSERT INTO user_notification_channels')));assert.match(sent[0].text,/berhasil terhubung/);assert.match(sent[0].text,/bantuan/);}finally{await app.close();}
});

test('all workflow stages and the approved learning library have distinct deterministic intents',()=>{
 for(const [question,domain] of [['Ringkasan Gap isu MTQ','gap'],['Status Content Studio organisasi masyarakat','content'],['Riwayat siklus MTQ','history'],['Evaluasi siklus MTQ','evaluation'],['Pelajaran dari pustaka pembelajaran MTQ','library'],['Berita media internal kemarin','owned'],['Daftar kandidat isu','candidate']])assert.equal(telegramAskIntent(question).domain,domain);
 assert.equal(telegramAskIntent('Ringkasan Gap MTQ siklus 1').cycle,1);
 assert.equal(telegramAskIntent('Ringkasan Strakom MTQ').details,true);
});

test('approved library searches lessons/tags across historical closed cycles without exposing drafts',async()=>{
 const x=db([{title:'MTQ',cycle_number:1,total:1,evaluation_status:'KNOWLEDGE_EVALUATION_APPROVED',evaluation_metadata:{evaluation:{summary:'Evaluasi tersimpan.',lessons:['Pelajaran terverifikasi.'],recommendations:['Perbaiki monitoring.']}}}]);
 const answer=await answerTelegramAsk(x.pool,user(),'Pelajaran pustaka pembelajaran MTQ siklus 1');
 for(const value of ['Disetujui Humas','Pelajaran terverifikasi.','Perbaiki monitoring.','siklus #1'])assert.ok(answer.includes(value));
 const q=x.queries.at(-1)!;assert.match(q.sql,/JOIN issue_workflows w ON w.issue_id=i.id/);assert.match(q.sql,/w.workflow_status='CLOSED'/);assert.match(q.sql,/AND x.event_type='KNOWLEDGE_EVALUATION_APPROVED'/);assert.match(q.sql,/metadata->'evaluation'->'lessons'/);assert.ok(q.params.includes(1));assert.ok(q.params.includes('%mtq%'));
});
for(const role of ['humas','executive','opd','district'])test(`${role} evaluation keeps the same scope and explicit draft approval rules`,async()=>{
 const x=db();await answerTelegramAsk(x.pool,user(role),'Evaluasi siklus MTQ');const q=x.queries.at(-1)!;
 assert.match(q.sql,/i.organization_id=\$1/);assert.match(q.sql,/w.workflow_status='CLOSED'/);
 if(role==='humas')assert.ok(!q.sql.includes("AND x.event_type='KNOWLEDGE_EVALUATION_APPROVED'"));else assert.ok(q.sql.includes("AND x.event_type='KNOWLEDGE_EVALUATION_APPROVED'"));
 if(role==='opd')assert.match(q.sql,/w.lead_opd_id=\$2/);if(role==='district')assert.match(q.sql,/d.district_id=\$2/);
});
test('Gap, publication, strategy and monitoring read the stored text instead of generating new analysis',async()=>{
 const rows=[{title:'MTQ',cycle_number:1,total:1,strategy_status:'APPROVED',executive_summary:'Strategi tersimpan.',key_messages:['Pesan resmi.'],published_at:'2026-10-16',gap_result:{data:{semanticAssessment:{status:'NO_RESPONSE',coverage:[{claim:'Klaim eksternal tersimpan.'}]}}},publication_result:{executionAssessment:{assessment:'Publikasi tersimpan.'}},monitoring_analyzed_at:'2026-10-16',monitoring_result:{analysis:{focusAssessment:{cycleConclusion:'Kesimpulan tersimpan.'}}}}];
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network allowed');};
 for(const [question,expected] of [['Ringkasan Gap MTQ siklus 1','Klaim eksternal tersimpan.'],['Ringkasan Strakom MTQ','Strategi tersimpan.'],['Hasil analisis publikasi MTQ','Publikasi tersimpan.'],['Kesimpulan monitoring MTQ','Kesimpulan tersimpan.']]){const x=db(rows);const answer=await answerTelegramAsk(x.pool,user(),question);assert.ok(answer.includes(expected),answer);assert.ok(!x.queries.some(q=>/INSERT|UPDATE|DELETE|ai_provider|ai_usage|ai_free_tier/.test(q.sql)));}
 assert.equal(calls,0);
});
test('Content Studio and candidate reads remain restricted to managers',async()=>{
 for(const role of ['executive','opd','district'])for(const question of ['Content Studio MTQ','Daftar kandidat isu']){
  const x=db();const answer=await answerTelegramAsk(x.pool,user(role),question);assert.match(answer,/Humas\/Super Admin/);assert.equal(x.queries.length,0);
 }
 const x=db([{title:'MTQ',content_status:'COMPLETED',item_count:2,ready_count:2,total:1}]);const answer=await answerTelegramAsk(x.pool,user(),'Content Studio MTQ');assert.match(answer,/2\/2 prompt siap/);assert.match(x.queries.at(-1)!.sql,/FROM content_projects/);
});
test('history reads closed cycles and explicitly distinguishes skipped stages',async()=>{
 const x=db([{title:'MTQ',cycle_number:1,total:2,workflow_status:'CLOSED'},{title:'MTQ',cycle_number:2,total:2,workflow_status:'CLOSED'}]);const answer=await answerTelegramAsk(x.pool,user(),'Riwayat siklus MTQ');
 assert.match(answer,/siklus #1/);assert.match(answer,/siklus #2/);assert.match(answer,/publikasi tidak dilalui/);assert.match(answer,/pembelajaran belum disetujui/);
});
test('Media Internal reads approved owned posts with organization and unit boundaries',async()=>{
 const x=db([{title:'Publikasi resmi',channel:'owned',risk_score:0,total:1}]);const answer=await answerTelegramAsk(x.pool,user('opd'),'Berita media internal kemarin');assert.match(answer,/Media Internal/);const q=x.queries.at(-1)!;
 assert.match(q.sql,/source_kind='owned'/);assert.match(q.sql,/curation_status,'approved'/);assert.match(q.sql,/COALESCE\(sm.opd_id,osa.opd_id\)=\$2/);assert.match(q.sql,/organization_id=\$1/);assert.ok(!q.sql.includes("source_kind='external'"));
});
