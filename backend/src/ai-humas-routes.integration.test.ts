import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { registerIssueTaxonomyManagementRoutes } from './issue-taxonomy-management-routes.js';
import { registerPhase3OutcomeRoutes } from './phase3-outcome-routes.js';
import { registerPhase5StrategyRoutes } from './phase5-strategy-routes.js';
import { encryptIntegrationCredential } from './integration-credentials.js';

const originalFetch=globalThis.fetch,originalKey=process.env.INTEGRATION_CREDENTIAL_KEY;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=originalKey;});
const secret='test-only-route-jwt';
const headers={cookie:'access_token='+jwt.sign({sub:'99'},secret)};
const auth=(role:string)=>({id:99,email:'test@example.invalid',role:role==='super_admin'?'admin':'operator',active:true,opd_id:null,district_id:null,roles:[role],permissions:[]});
const row=(rows:any[])=>({rows,rowCount:rows.length});
async function appFor(register:any,query:(sql:string,params?:any[])=>Promise<any>){
 const app=Fastify();await app.register(cookie);
 const pool={query,connect:async()=>({query,release(){}})} as unknown as Pool;
 await register(app,pool,secret);await app.ready();return app;
}

test('Gap GET without snapshot never executes an analysis; read-only POST is forbidden',async()=>{
 let role='humas';const statements:string[]=[];
 const app=await appFor(registerIssueTaxonomyManagementRoutes,async(sql)=>{
  statements.push(sql);
  if(sql.includes('FROM users u'))return row([auth(role)]);
  if(sql.includes('FROM organizations'))return row([{id:1}]);
  if(sql.includes('SELECT i.id,i.title'))return row([{id:1,status:'active'}]);
  if(sql.includes('JOIN issue_communication_gap_snapshots'))return row([]);
  throw Error('UNEXPECTED_DB: '+sql);
 });
 try{
  const result=await app.inject({method:'GET',url:'/api/admin/issue-taxonomy/issues/1/communication-gap',headers});
  assert.equal(result.statusCode,404);assert.equal(result.json().error,'COMMUNICATION_GAP_SNAPSHOT_NOT_FOUND');
  role='executive';const forbidden=await app.inject({method:'POST',url:'/api/admin/issue-taxonomy/issues/1/communication-gap',headers,payload:{force:true}});
  assert.equal(forbidden.statusCode,403);
  assert.ok(!statements.some(s=>s.includes('ai_humas_model_selections')||s.includes('advisory')));
 }finally{await app.close();}
});
test('Gap POST reuses saved snapshot and force refuses workflows past NEW',async()=>{
 const statements:string[]=[];
 const app=await appFor(registerIssueTaxonomyManagementRoutes,async(sql)=>{
  statements.push(sql);
  if(sql.includes('FROM users u'))return row([auth('humas')]);
  if(['BEGIN','ROLLBACK'].includes(sql))return row([]);
  if(sql.includes('pg_try_advisory_xact_lock'))return row([{acquired:true}]);
  if(sql.includes('FROM organizations'))return row([{id:1}]);
  if(sql.includes('SELECT i.id,i.title'))return row([{id:1,status:'active'}]);
  if(sql.includes('JOIN issue_communication_gap_snapshots'))return row([{result:{data:{marker:'saved'}},signature:{external:1,owned:0,evidenceFingerprint:'x'},workflow_id:10,cycle_number:1}]);
  if(sql.includes('online_count'))return row([{online_count:1,print_count:0,social_count:0}]);
  if(sql.includes('SELECT id,cycle_number,workflow_status'))return row([{id:10,workflow_status:'STRATEGY'}]);
  throw Error('UNEXPECTED_DB: '+sql);
 });
 try{
  const result=await app.inject({method:'POST',url:'/api/admin/issue-taxonomy/issues/1/communication-gap',headers,payload:{}});
  assert.equal(result.statusCode,200);assert.equal(result.json().data.marker,'saved');
  const rejected=await app.inject({method:'POST',url:'/api/admin/issue-taxonomy/issues/1/communication-gap',headers,payload:{force:true}});
  assert.equal(rejected.statusCode,409);assert.equal(rejected.json().error,'GAP_ANALYSIS_WORKFLOW_LOCKED');
  assert.ok(!statements.some(s=>s.includes('ai_provider_credentials')));
 }finally{await app.close();}
});

test('Monitoring uses saved Gap/Publication and invokes only monitoring_analysis',async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-encryption';
 const credential=encryptIntegrationCredential('mock-only');
 const statements:Array<{sql:string;params:any[]}>=[];let generations=0;let prompt='';
 const baseline={data:{externalAngles:{claims:[{claim:'original gap'}]},semanticAssessment:{status:'PARTIAL_RESPONSE'},issueContext:{opds:{primary:{name:'OPD utama'}}}}};
 const publication={monitoringFocus:[{type:'MESSAGE_PICKUP',target:'pesan resmi'}],strategyEssence:{summary:'baseline publication'}};
 const app=await appFor(registerPhase3OutcomeRoutes,async(sql,params=[])=>{
  statements.push({sql,params});
  if(sql.includes('FROM users u'))return row([auth('humas')]);
  if(sql.includes('FROM issue_workflows w JOIN issues'))return row([{id:10,issue_id:1,title:'Isu contoh',workflow_status:'MONITORING'}]);
  if(sql.includes('FROM issue_workflow_events'))return row([{event_type:'RESPONSE_PUBLISHED',created_at:'2026-10-15T00:00:00Z'},{event_type:'MONITORING_STARTED',created_at:'2026-10-15T00:01:00Z'}]);
  if(sql.includes('FROM issue_articles'))return row([{id:2,title:'Berita baru',content:'Isi berita monitoring terbaru'}]);
  if(sql.includes('FROM issue_print_articles')||sql.includes('FROM social_mention_issues'))return row([]);
  if(sql.includes('FROM issue_communication_gap_snapshots'))return row([{result:baseline,analyzed_at:'2026-10-14'}]);
  if(sql.includes('FROM issue_publication_analysis_snapshots'))return row([{result:publication}]);
  if(sql.includes('FROM issue_response_submissions'))return row([]);
  if(sql.includes('FROM ai_humas_model_selections')){
    assert.deepEqual(params,['monitoring_analysis']);
    return row([{task_id:3,task_enabled:true,provider_id:2,provider:'gemini',provider_enabled:true,model_id:4,model:'selected-monitor',model_enabled:true,prompt_text:'Arahan Monitoring Humas. JSON wajib.',prompt_version:2}]);
  }
  if(sql.includes('FROM ai_provider_credentials'))return row([{credential_ciphertext:credential}]);
  if(sql.includes('INSERT INTO ai_free_tier_daily_usage'))return row([{model_id:4}]);
  if(sql.includes('INSERT INTO ai_gemini_quota_feature_audit')||sql.includes('INSERT INTO ai_usage_logs'))return row([{id:1}]);
  if(sql.includes('INSERT INTO issue_monitoring_analysis_snapshots'))return row([{analyzed_at:'2026-10-16'}]);
  throw Error('UNEXPECTED_DB: '+sql);
 });
 globalThis.fetch=async(url,init)=>{
   assert.ok(String(url).includes('selected-monitor'));generations++;
   prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text;
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"evidenceSufficiency":"LIMITED","cycleConclusion":"Hasil monitoring"}'}]}}],usageMetadata:{promptTokenCount:500,candidatesTokenCount:30}});
 };
 try{
  const result=await app.inject({method:'POST',url:'/api/phase3/issues/1/monitoring-periods/1/analyze',headers,payload:{}});
  assert.equal(result.statusCode,200,result.body);assert.equal(generations,1);
  assert.ok(prompt.includes('Isi berita monitoring terbaru'));assert.ok(prompt.includes('baseline publication'));assert.ok(prompt.includes('original gap'));
  assert.deepEqual(result.json().data.analysis.externalAngles,baseline.data.externalAngles);
  assert.ok(!statements.some(q=>q.sql.includes('issue_publication_evidence_files')||q.sql.includes('INSERT INTO issue_communication_gap_snapshots')));
 }finally{await app.close();}
});

test('Content Studio source extraction reads the selected model and editable prompt',async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-encryption';
 const credential=encryptIntegrationCredential('mock-only');let generations=0;
 const app=await appFor(registerPhase5StrategyRoutes,async(sql,params=[])=>{
  if(sql.includes('FROM users u'))return row([auth('humas')]);
  if(sql.includes('SELECT s.*,p.status project_status'))return row([{id:5,project_status:'DRAFT',category:'DATA_STATISTICS',source_url:'https://example.invalid/source'}]);
  if(sql.includes('FROM ai_humas_model_selections')){
    assert.deepEqual(params,['content_studio_prompting']);
    return row([{task_id:3,task_enabled:true,provider_id:2,provider:'gemini',provider_enabled:true,model_id:4,model:'humas-studio-model',model_enabled:true,prompt_text:'Gaya sumber sesuai prompt Humas. JSON.',prompt_version:3}]);
  }
  if(sql.includes('FROM ai_provider_credentials'))return row([{credential_ciphertext:credential}]);
  if(sql.includes('INSERT INTO ai_free_tier_daily_usage'))return row([{model_id:4}]);
  if(sql.includes('INSERT INTO ai_gemini_quota_feature_audit')||sql.includes('INSERT INTO ai_usage_logs'))return row([{id:1}]);
  if(sql.includes('UPDATE content_project_sources')){assert.equal(JSON.parse(params[1])[0].text,'100 layanan');return row([{id:5,status:'EXTRACTED'}]);}
  throw Error('UNEXPECTED_DB: '+sql);
 });
 globalThis.fetch=async(url,init)=>{
   if(String(url)==='https://example.invalid/source')return new Response('<p>Tersedia 100 layanan.</p>');
   assert.ok(String(url).includes('humas-studio-model'));generations++;
   const prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text;
   assert.ok(prompt.includes('Gaya sumber sesuai prompt Humas'));assert.ok(prompt.includes('100 layanan'));
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"sourceTitle":"Sumber resmi","facts":[{"type":"STATISTIC","text":"100 layanan"}]}'}]}}],usageMetadata:{promptTokenCount:30,candidatesTokenCount:20}});
 };
 try{
   const result=await app.inject({method:'POST',url:'/api/phase6/content-projects/1/sources/5/extract',headers,payload:{}});
   assert.equal(result.statusCode,200,result.body);assert.equal(generations,1);assert.equal(result.json().data.status,'EXTRACTED');
 }finally{await app.close();}
});

for(const outcome of ['success','invalid-output','provider-failure','project-locked'])test(`Content Studio Buat/Regenerasi Prompt: ${outcome}`,async()=>{
 process.env.INTEGRATION_CREDENTIAL_KEY='test-only-encryption';
 const credential=encryptIntegrationCredential('mock-only');
 const oldPrompt={prompt:'Prompt lama yang sudah tersimpan'};
 let saved:any=null,generations=0,usageLogs=0,quotas=0;const missing:string[]=[];
 const guidance='Susun siaran pers dengan lead informatif, dahulukan manfaat publik, gunakan struktur jurnalistik yang runtut, dan pertahankan kutipan persis sesuai brief.';
 const item={id:5,project_id:1,title:'Siaran pers kegiatan',format:'PRESS_RELEASE',audience:'MASYARAKAT_UMUM',purpose:'EDUKASI_SOSIALISASI',tone:'RESMI_FORMAL',channels:['WEBSITE_RESMI'],reference_asset_indexes:[0],official_asset_keys:['LOGO_PEMKO'],prompt_snapshot:oldPrompt};
 const project={id:1,status:outcome==='project-locked'?'COMPLETED':'READY',production_parameters:{},context_snapshot:{executiveSummary:'Ringkasan Strakom yang disetujui',keyMessages:['Pesan utama Strakom'],inputSnapshot:{issue:{title:'Isu contoh'}}},reference_assets:[{name:'foto-kegiatan.jpg'}],official_assets:[{type:'LOGO_PEMKO',name:'Logo Pemko'}],production_notes:'Utamakan manfaat publik.'};
 const app=await appFor(registerPhase5StrategyRoutes,async(sql,params=[])=>{
  if(sql.includes('FROM users u'))return row([auth('humas')]);
  if(sql.includes('SELECT * FROM content_projects'))return row([project]);
  if(sql.includes('SELECT * FROM content_project_items'))return row([{...item,prompt_snapshot:saved||oldPrompt}]);
  if(sql.includes('FROM content_project_sources'))return row([{id:7,category:'OFFICIAL_STATEMENT',source_title:'Pernyataan terkonfirmasi',confirmed_facts:[{type:'QUOTE',speaker:'Narasumber terkonfirmasi',text:'Tersedia 100 layanan.'}]}]);
  if(sql.includes('FROM ai_humas_model_selections')){
    assert.deepEqual(params,['content_studio_prompting']);
    return row([{task_id:3,task_enabled:true,provider_id:2,provider:'gemini',provider_enabled:true,model_id:4,model:'selected-prompt-model',model_enabled:true,prompt_text:'Arahan dasar Humas yang terbaru dari database.',prompt_version:8}]);
  }
  if(sql.includes('FROM ai_provider_credentials'))return row([{credential_ciphertext:credential}]);
  if(sql.includes('INSERT INTO ai_free_tier_daily_usage')){quotas++;return row([{model_id:4}]);}
  if(sql.includes('INSERT INTO ai_gemini_quota_feature_audit'))return row([{id:1}]);
  if(sql.includes('INSERT INTO ai_usage_logs')){usageLogs++;return row([{id:1}]);}
  if(sql.includes('UPDATE content_project_items')){
    saved=JSON.parse(params[0]);assert.deepEqual(params.slice(1),['99',5,1]);return row([{...item,status:'PROMPT_READY',prompt_snapshot:saved}]);
  }
  throw Error('UNEXPECTED_DB: '+sql);
 });
 globalThis.fetch=async(url,init)=>{
   generations++;assert.ok(String(url).includes('selected-prompt-model'));
   const prompt=JSON.parse(String(init?.body)).contents[0].parts[0].text;
   for(const text of ['Arahan dasar Humas yang terbaru','PROMPT PRODUKSI untuk AI lain','Pesan utama Strakom','Tersedia 100 layanan.','gambar referensi terlampir #1','LOCKED ASSET','Utamakan manfaat publik.'])if(!prompt.includes(text))missing.push(text);
   if(outcome==='provider-failure')return new Response('',{status:503});
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({productionGuidance:outcome==='invalid-output'?'':guidance})}]}}],usageMetadata:{promptTokenCount:500,candidatesTokenCount:70}});
 };
 try{
   const result=await app.inject({method:'POST',url:'/api/phase6/content-projects/1/items/5/prompt',headers});
   assert.deepEqual(missing,[]);
   assert.equal(result.statusCode,outcome==='success'?200:outcome==='project-locked'?409:503,result.body);
   if(outcome!=='success')assert.equal(result.json().error,({ 'invalid-output':'AI_CONTENT_STUDIO_INVALID_GUIDANCE','provider-failure':'AI_PROVIDER_HTTP_503','project-locked':'CONTENT_PROJECT_NOT_READY'} as any)[outcome]);
   assert.equal(generations,outcome==='project-locked'?0:1);
   assert.equal(usageLogs,outcome==='project-locked'?0:1);assert.equal(quotas,outcome==='project-locked'?0:1);
   if(outcome==='success'){
     assert.equal(saved.executionMode,'AI_ASSISTED_PROMPT');assert.equal(saved.basePromptVersion,8);assert.equal(saved.selectedModel.model,'selected-prompt-model');
     for(const text of [guidance,'Tersedia 100 layanan.','Pesan utama Strakom','LOCKED ASSET','GUARDRAIL WAJIB','gambar referensi terlampir #1'])assert.ok(saved.prompt.includes(text),text);
   }else assert.equal(saved,null,'failed or locked generation must not overwrite the old prompt');
   const reload=await app.inject({method:'GET',url:'/api/phase6/content-projects/1/items',headers});
   assert.equal(reload.statusCode,200);assert.equal(generations,outcome==='project-locked'?0:1,'reading a saved prompt must not invoke AI');
   if(outcome!=='success')assert.equal(reload.json().data[0].prompt_snapshot.prompt,oldPrompt.prompt);
 }finally{await app.close();}
});
