import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { registerKnowledgeEvaluationRoutes } from './knowledge-evaluation-routes.js';
import { encryptIntegrationCredential } from './integration-credentials.js';
const originalFetch=globalThis.fetch,originalKey=process.env.INTEGRATION_CREDENTIAL_KEY;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=originalKey;});
const secret='knowledge-test-only';
const headers={cookie:'access_token='+jwt.sign({sub:'99'},secret)};
const evaluation={summary:'Ringkasan hasil siklus dengan bukti terbatas.',strengths:['Pesan resmi konsisten.'],weaknesses:['Bukti pascapublikasi terbatas.'],lessons:['Gunakan satu pesan utama saat concern serupa muncul, setelah verifikasi kondisi terbaru.'],recommendations:['Siapkan jadwal informasi berikutnya.'],tags:['sampah']};
async function fixture(options:{role?:string;foreign?:boolean;noMonitoring?:boolean;aiFailure?:boolean}={}){
 let role=options.role||'humas',events:any[]=[];let seq=1;
 const queries:Array<{sql:string;params:any[]}>=[];
 const workflow={id:10,issue_id:1,cycle_number:1,workflow_status:'CLOSED',issue_title:'Isu sampah',organization_id:1,lead_opd_id:7,lead_opd_name:'Dinas terkait',geographic_scope:'DISTRICTS',created_at:'2026-10-01T00:00:00Z',published_at:'2026-10-02T00:00:00Z',closed_at:'2026-10-03T00:00:00Z'};
 const row=(rows:any[])=>({rows,rowCount:rows.length});
 const query=async(sql:string,params:any[]=[])=>{
  queries.push({sql,params});
  if(sql.includes('FROM users u'))return row([{id:99,email:'test@example.invalid',role:'operator',opd_id:role==='opd'?7:null,district_id:role==='district'?8:null,active:true,roles:[role],permissions:[]}]);
  if(sql.includes('SELECT organization_id FROM opd'))return row([{organization_id:1}]);
  if(sql.includes('FROM organizations'))return row([{id:1}]);
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return row([]);
  if(sql.includes('pg_try_advisory_xact_lock'))return row([{acquired:true}]);
  if(sql.includes('FROM issue_workflows w')){
    assert.match(sql,/i\.organization_id=\$1/);assert.equal(params[0],1);
    if(role==='opd'){assert.match(sql,/w\.lead_opd_id=\$2/);assert.equal(params[1],'7');}
    if(role==='district'){assert.match(sql,/contributor_type='DISTRICT'/);assert.equal(params[1],'8');}
    if(options.foreign)return sql.includes('COUNT(*)')?row([{total:0}]):row([]);
    if(sql.includes('COUNT(*)'))return row([{total:events.some(e=>e.event_type==='KNOWLEDGE_EVALUATION_APPROVED')||!sql.includes('AND e.id IS NOT NULL')?1:0}]);
    if(sql.includes('e.id AS evaluation_version')){
      const filtered=sql.includes("AND ke.event_type='KNOWLEDGE_EVALUATION_APPROVED'")?events.filter(e=>e.event_type==='KNOWLEDGE_EVALUATION_APPROVED'):events;
      const e=filtered.at(-1);if(sql.includes('AND e.id IS NOT NULL')&&!e)return row([]);
      return row([{workflow_id:10,issue_id:1,cycle_number:1,issue_title:workflow.issue_title,closed_at:workflow.closed_at,lead_opd_name:workflow.lead_opd_name,evaluation_version:e?.id,event_type:e?.event_type,metadata:e?.metadata,evaluated_at:e?.created_at}]);
    }
    assert.match(sql,/w\.workflow_status='CLOSED'/);return row(params.at(-1)==='10'?[workflow]:[]);
  }
  if(sql.includes('SELECT id,event_type,metadata')){
    const filtered=sql.includes("AND event_type='KNOWLEDGE_EVALUATION_APPROVED'")?events.filter(e=>e.event_type==='KNOWLEDGE_EVALUATION_APPROVED'):events;
    return row(filtered.length?[filtered.at(-1)]:[]);
  }
  if(sql.includes('FROM issue_communication_gap_snapshots'))return row([{id:1,result:{data:{semanticAssessment:{status:'PARTIAL_RESPONSE',coverage:[{claim:'Concern awal',label:'Informasi / Fakta',status:'NOT_COVERED',matchScore:0,reason:'Respons resmi membahas kegiatan berbeda.',matchedOfficial:null}]},externalAngles:{claims:[{claim:'Concern awal'}],geographicAnalysis:{implication:'Perlu informasi tingkat kota.'}}}}}]);
  if(sql.includes('FROM communication_strategies'))return row([{id:2,version:1,executive_summary:'Strategi tersimpan',key_messages:['Pesan resmi']}]);
  if(sql.includes('FROM issue_publication_analysis_snapshots'))return row([{id:3,result:{executionAssessment:{status:'ALIGNED',assessment:'Publikasi mengikuti strategi.'},strengths:['Pesan konsisten.']}}]);
  if(sql.includes('FROM issue_monitoring_analysis_snapshots'))return row(options.noMonitoring?[]:[{id:4,period_number:1,evidence_summary:{total:5,online:3,owned:2},result:{analysis:{focusAssessment:{evidenceSufficiency:'LIMITED',cycleConclusion:'Kesimpulan monitoring tersimpan.',weaknesses:['Bukti terbatas.']}}}}]);
  if(sql.includes('FROM issue_response_submissions'))return row([]);
  if(sql.includes('FROM issue_keywords'))return row([{id:1,keyword:'sampah',keyword_role:'PRIMARY'}]);
  if(sql.includes('FROM issue_districts'))return row([{id:8,name:'Kecamatan contoh'}]);
  if(sql.includes('INSERT INTO issue_workflow_events')){
   const e={id:seq++,event_type:params[4],metadata:JSON.parse(params[6]),created_at:'2026-10-17T00:00:00Z',actor_user_id:params[2]};events.push(e);return row([e]);
  }
  if(sql.includes('FROM ai_humas_model_selections')){assert.deepEqual(params,['monitoring_analysis']);return row([{task_id:3,task_enabled:true,provider_id:2,provider:'gemini',provider_enabled:true,model_id:4,model:'selected-monitoring-model',model_enabled:true,prompt_text:'Arahan Monitoring dari database.',prompt_version:1}]);}
  if(sql.includes('FROM ai_provider_credentials'))return row([{credential_ciphertext:encryptIntegrationCredential('mock-only-key')}]);
  if(sql.includes('INSERT INTO ai_free_tier_daily_usage'))return row([{model_id:4}]);
  if(sql.includes('INSERT INTO ai_gemini_quota_feature_audit')||sql.includes('INSERT INTO ai_usage_logs'))return row([{id:1}]);
  throw Error('UNEXPECTED_SQL: '+sql);
 };
 const app=Fastify();await app.register(cookie);await registerKnowledgeEvaluationRoutes(app,{query,connect:async()=>({query,release(){}})} as unknown as Pool,secret);await app.ready();
 return{app,queries,events:()=>events,setRole:(r:string)=>{role=r;}};
}
const draft=(app:any,expectedVersion:string|null,e=evaluation)=>app.inject({method:'PUT',url:'/api/knowledge/cycles/10/draft',headers,payload:{expectedVersion,evaluation:e}});

test('closed-cycle evaluation supports draft, approval, library, and reviewed-version preservation',async()=>{
 const x=await fixture();try{
  const initial=await x.app.inject({method:'GET',url:'/api/knowledge/cycles/10',headers});assert.equal(initial.statusCode,200,initial.body);assert.equal(initial.json().data.metrics.evidenceSufficiency,'LIMITED');assert.equal(initial.json().data.saved,null);
  const saved=await draft(x.app,null);assert.equal(saved.statusCode,200,saved.body);const version=saved.json().data.version;
  const approved=await x.app.inject({method:'POST',url:'/api/knowledge/cycles/10/approve',headers,payload:{expectedVersion:version}});assert.equal(approved.statusCode,200,approved.body);assert.equal(approved.json().data.status,'APPROVED');
  const library=await x.app.inject({method:'GET',url:'/api/knowledge/cycles?view=library',headers});assert.equal(library.json().data[0].evaluation.summary,evaluation.summary);
  const revision=await draft(x.app,approved.json().data.version,{...evaluation,summary:'Draft revisi yang belum disetujui oleh Humas.'});assert.equal(revision.statusCode,200,revision.body);
  x.setRole('executive');const reader=await x.app.inject({method:'GET',url:'/api/knowledge/cycles/10',headers});assert.equal(reader.json().data.saved.evaluation.summary,evaluation.summary);assert.equal(reader.json().data.canManage,false);
  assert.ok(!x.queries.some(q=>/^UPDATE (issues|issue_workflows|issue_communication_gap|communication_strategies|issue_publication)/.test(q.sql)));
 }finally{await x.app.close();}
});
test('stale draft save and approval cannot replace a newer review',async()=>{
 const x=await fixture();try{
  await draft(x.app,null);
  const stale=await draft(x.app,null);assert.equal(stale.statusCode,409);assert.equal(stale.json().error,'KNOWLEDGE_VERSION_CONFLICT');
  const approve=await x.app.inject({method:'POST',url:'/api/knowledge/cycles/10/approve',headers,payload:{expectedVersion:'999'}});assert.equal(approve.statusCode,409);assert.equal(x.events().length,1);
 }finally{await x.app.close();}
});
test('approval requires an explicit lesson and preserves limited-evidence facts',async()=>{
 const x=await fixture();try{
  const saved=await draft(x.app,null,{...evaluation,lessons:[]});
  const r=await x.app.inject({method:'POST',url:'/api/knowledge/cycles/10/approve',headers,payload:{expectedVersion:saved.json().data.version}});
  assert.equal(r.statusCode,409);assert.equal(r.json().error,'KNOWLEDGE_REVIEW_INCOMPLETE');assert.equal(x.events()[0].metadata.metrics.evidenceSufficiency,'LIMITED');
 }finally{await x.app.close();}
});
for(const role of ['executive','opd','district'])test(`${role} reads scoped cycles and cannot edit, approve, or invoke AI`,async()=>{
 const x=await fixture({role});try{
  const read=await x.app.inject({method:'GET',url:'/api/knowledge/cycles/10',headers});assert.equal(read.statusCode,200,read.body);assert.equal(read.json().data.canManage,false);
  for(const [method,suffix,payload]of [['PUT','draft',{expectedVersion:null,evaluation}],['POST','approve',{expectedVersion:'1'}],['POST','summarize',{expectedVersion:null}]] as const){const r=await x.app.inject({method,url:'/api/knowledge/cycles/10/'+suffix,headers,payload});assert.equal(r.statusCode,403,r.body);}
  assert.equal(x.events().length,0);assert.ok(!x.queries.some(q=>q.sql.includes('ai_humas_model_selections')));
 }finally{await x.app.close();}
});
test('viewer and unauthenticated requests cannot access knowledge',async()=>{
 const x=await fixture({role:'viewer'});try{assert.equal((await x.app.inject({method:'GET',url:'/api/knowledge/cycles',headers})).statusCode,403);assert.equal((await x.app.inject({method:'GET',url:'/api/knowledge/cycles'})).statusCode,401);}finally{await x.app.close();}
});
test('out-of-scope or foreign cycles cannot be read or written',async()=>{
 const x=await fixture({foreign:true});try{
  assert.equal((await x.app.inject({method:'GET',url:'/api/knowledge/cycles/10',headers})).statusCode,404);
  assert.equal((await draft(x.app,null)).statusCode,404);assert.equal(x.events().length,0);
 }finally{await x.app.close();}
});
for(const failed of [false,true])test(`optional AI summarizes only saved results and ${failed?'retains the old draft on failure':'saves a reviewable draft'}`,async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-knowledge-key';const x=await fixture();let calls=0;
 globalThis.fetch=async(url,init)=>{calls++;assert.ok(String(url).includes('selected-monitoring-model'));const text=JSON.parse(String(init?.body)).contents[0].parts[0].text;assert.match(text,/HASIL ANALISIS SIKLUS YANG SUDAH TERSIMPAN/);assert.match(text,/Kesimpulan monitoring tersimpan/);return failed?new Response('',{status:503}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(evaluation)}]}}],usageMetadata:{promptTokenCount:600,candidatesTokenCount:100}});};
 try{
  const r=await x.app.inject({method:'POST',url:'/api/knowledge/cycles/10/summarize',headers,payload:{expectedVersion:null}});assert.equal(r.statusCode,failed?503:200,r.body);assert.equal(calls,1);
  assert.equal(x.events().length,failed?0:1);if(!failed){assert.equal(r.json().data.status,'DRAFT');assert.equal(r.json().data.ai.model,'selected-monitoring-model');}
  assert.ok(!x.queries.some(q=>q.sql.includes('INSERT INTO issue_communication_gap_snapshots')||q.sql.includes('INSERT INTO issue_monitoring_analysis_snapshots')));
 }finally{await x.app.close();}
});

test('knowledge exposes the saved Gap claims, zero coverage score, reason and geography without reanalysis',async()=>{
 const x=await fixture();try{
  const r=await x.app.inject({method:'GET',url:'/api/knowledge/cycles/10',headers});assert.equal(r.statusCode,200,r.body);
  const gap=r.json().data.source.gap;
  assert.deepEqual(gap.claims,['Concern awal']);
  assert.equal(gap.coverage[0].matchScore,0);
  assert.equal(gap.coverage[0].reason,'Respons resmi membahas kegiatan berbeda.');
  assert.equal(gap.geographicAnalysis.implication,'Perlu informasi tingkat kota.');
  assert.ok(!x.queries.some(q=>q.sql.includes('ai_humas_model_selections')||q.sql.includes('INSERT')));
 }finally{await x.app.close();}
});
test('list, OPD search and cycle detail use the same organization-bound saved routing fallback',async()=>{
 const x=await fixture();try{
  for(const url of ['/api/knowledge/cycles?q=Kesbangpol','/api/knowledge/cycles/10']){
   const r=await x.app.inject({method:'GET',url,headers});assert.equal(r.statusCode,200,r.body);
  }
  const reads=x.queries.filter(q=>q.sql.includes('FROM issue_workflows w'));
  assert.equal(reads.length,3);
  for(const {sql} of reads){
   assert.match(sql,/COALESCE\(w\.lead_opd_id,/);
   assert.match(sql,/#>>'\{issueContext,opds,primary,id\}'/);
   assert.match(sql,/gs\.workflow_id=w\.id/);
   assert.match(sql,/so\.organization_id=i\.organization_id/);
   assert.match(sql,/ORDER BY ko\.weight DESC,ro\.id/);
  }
  assert.match(reads[0].sql,/o\.name ILIKE/);
 }finally{await x.app.close();}
});
