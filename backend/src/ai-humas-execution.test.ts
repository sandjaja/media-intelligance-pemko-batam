import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Pool } from 'pg';
import { encryptIntegrationCredential } from './integration-credentials.js';
import { loadHumasAiTask, executeHumasAi, type HumasAiTask } from './ai-humas-execution.js';
import { withHumasAnalysisLock } from './ai-humas-analysis-lock.js';

const originalFetch=globalThis.fetch;
const originalKey=process.env.INTEGRATION_CREDENTIAL_KEY;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=originalKey;});
const tasks:HumasAiTask[]=['gap_analysis','strakom_analysis','publication_analysis','monitoring_analysis','content_studio_prompting'];
function db(provider='gemini',options:{missing?:boolean;disabled?:boolean;prompt?:string;budget?:boolean;quota?:boolean;evaluation?:boolean;evaluationMissing?:boolean}={}){
  process.env.INTEGRATION_CREDENTIAL_KEY='test-only-humas-encryption-key';
  const ciphertext=encryptIntegrationCredential('test-only-provider-key');
  const statements:Array<{sql:string;params:any[]}>=[];
  const query=async(sql:string,params:any[]=[])=>{
    statements.push({sql,params});
    const result=(rows:any[])=>({rows,rowCount:rows.length});
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return result([]);
    if(sql.includes('FROM ai_humas_model_selections s')&&!sql.includes('FROM ai_models m'))return result(options.missing?[]:[{task_id:3,task_enabled:true,provider_id:2,provider,provider_enabled:!options.disabled,model_id:4,model:'selected-model',model_enabled:true,prompt_text:options.prompt??'Arahan terbaru Humas. Keluarkan JSON.',prompt_version:7}]);
    if(sql.includes('SELECT m.id FROM ai_models')){if(options.evaluation)assert.equal(params[2],16);return result([{id:4}]);}
    if(sql.includes('FROM ai_task_routes r')){if(options.evaluation){assert.equal(params[0],'evaluation_analysis');assert.ok(sql.includes("CASE WHEN t.code='evaluation_analysis' THEN 'monitoring_analysis'"));}return result([{task_id:options.evaluation?16:3,provider_id:2,model_id:4}]);}
    if(sql.includes('SELECT id FROM ai_tasks'))return result(options.evaluationMissing?[]:[{id:16}]);
    if(sql.includes('FROM ai_provider_credentials'))return result([{credential_ciphertext:ciphertext}]);
    if(sql.includes('ai_model_prices'))return result([{input_usd_per_million:1,output_usd_per_million:2}]);
    if(sql.includes('INSERT INTO ai_free_tier_daily_usage'))return result(options.quota===false?[]:[{model_id:4}]);
    if(sql.includes('INSERT INTO ai_gemini_quota_feature_audit'))return result([{id:1}]);
    if(sql.includes('SELECT id FROM ai_providers WHERE'))return result([{id:2}]);
    if(sql.includes('FROM ai_provider_budgets'))return result(options.budget===false?[]:[{id:5,limit_usd:10}]);
    if(sql.includes('FROM ai_provider_balance_snapshots'))return result([{balance_usd:10,committed_baseline_usd:0}]);
    if(sql.includes('SUM(CASE'))return result([{usd:0}]);
    if(sql.includes('INSERT INTO ai_budget_reservations'))return result([{id:7}]);
    if(sql.includes('SELECT r.task_id'))return result([{task_id:options.evaluation?16:3,status:'reserved',provider_id:2}]);
    if(sql.includes('SELECT status FROM ai_budget_reservations'))return result([{status:'reserved'}]);
    if(sql.includes('UPDATE ai_budget_reservations'))return result([{id:7}]);
    if(sql.includes('INSERT INTO ai_usage_logs'))return result([{id:8}]);
    throw new Error('UNEXPECTED_SQL: '+sql);
  };
  return{pool:{query,connect:async()=>({query,release(){}})} as unknown as Pool,statements};
}
function response(provider:string){
 const usage={input_tokens:12,output_tokens:4};
 return provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text:'{"ok":true}'}]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:4,thoughtsTokenCount:2}}
 :provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}],usage}
 :{stop_reason:'end_turn',content:[{type:'text',text:'{"ok":true}'}],usage};
}
for(const provider of ['gemini','openai','anthropic'])test(`all five tasks execute exact ${provider} selection and database prompt`,async()=>{
 const x=db(provider),hosts:string[]=[],bodies:any[]=[];
 globalThis.fetch=async(url,init)=>{hosts.push(new URL(String(url)).hostname);bodies.push(JSON.parse(String(init?.body)));return Response.json(response(provider));};
 for(const taskCode of tasks){
   const config=await loadHumasAiTask(x.pool,taskCode);
   assert.equal(config.promptVersion,7);
   const data=await executeHumasAi(x.pool,{userId:99,taskCode,config,prompt:config.prompt+'\nDATA: {}'});
   assert.deepEqual(data,{ok:true});
 }
 assert.equal(hosts.length,5);
 assert.ok(hosts.every(h=>h===({gemini:'generativelanguage.googleapis.com',openai:'api.openai.com',anthropic:'api.anthropic.com'} as any)[provider]));
 assert.ok(bodies.every(b=>JSON.stringify(b).includes('Arahan terbaru Humas')));
 assert.ok(bodies.every(b=>JSON.stringify(b).includes('selected-model')||provider==='gemini'));
 assert.equal(x.statements.filter(q=>q.sql.includes('INSERT INTO ai_usage_logs')).length,5);
 assert.equal(x.statements.filter(q=>q.sql.includes('INSERT INTO ai_free_tier_daily_usage')).length,provider==='gemini'?5:0);
 if(provider==='gemini')assert.ok(x.statements.filter(q=>q.sql.includes('INSERT INTO ai_usage_logs')).every(q=>q.params[5]===12&&q.params[6]===6));
 else assert.equal(x.statements.filter(q=>q.sql.includes('INSERT INTO ai_budget_reservations')).length,5);
});

test('missing selection, disabled model and empty database prompt never call provider',async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('UNEXPECTED_PROVIDER');};
 for(const options of [{missing:true},{disabled:true},{prompt:'   '}]){
  const x=db('openai',options);
  await assert.rejects(loadHumasAiTask(x.pool,'gap_analysis'),/AI_HUMAS_/);
 }
 assert.equal(calls,0);
});
test('paid budget rejection never calls any model or falls back to Gemini',async()=>{
 const x=db('openai',{budget:false});let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('UNEXPECTED_PROVIDER');};
 const config=await loadHumasAiTask(x.pool,'strakom_analysis');
 await assert.rejects(executeHumasAi(x.pool,{userId:99,taskCode:'strakom_analysis',config,prompt:config.prompt}),/AI_BUDGET_NOT_CONFIGURED/);
 assert.equal(calls,0);
});
test('exhausted Gemini daily quota prevents provider call',async()=>{
 const x=db('gemini',{quota:false});let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('UNEXPECTED_PROVIDER');};
 const config=await loadHumasAiTask(x.pool,'gap_analysis');
 await assert.rejects(executeHumasAi(x.pool,{userId:99,taskCode:'gap_analysis',config,prompt:config.prompt}),/AI_GEMINI_DAILY_QUOTA/);
 assert.equal(calls,0);
});
for(const provider of ['openai','anthropic'])test(`${provider} publication includes PDF/images and reserves after full input count`,async()=>{
 const x=db(provider),order:string[]=[],bodies:any[]=[];
 globalThis.fetch=async(url,init)=>{
  const counting=String(url).endsWith('input_tokens')||String(url).endsWith('count_tokens');
  order.push(counting?'count':'generate');bodies.push(JSON.parse(String(init?.body)));
  if(!counting)assert.ok(x.statements.some(q=>q.sql.includes('INSERT INTO ai_budget_reservations')),'budget committed before generation');
  return Response.json(counting?{input_tokens:4500}:response(provider));
 };
 const config=await loadHumasAiTask(x.pool,'publication_analysis');
 await executeHumasAi(x.pool,{userId:99,taskCode:'publication_analysis',config,prompt:config.prompt,mediaParts:[
  {inlineData:{mimeType:'application/pdf',data:Buffer.from('%PDF-test').toString('base64')}},
  {inlineData:{mimeType:'image/png',data:Buffer.from('image-test').toString('base64')}},
 ]});
 assert.deepEqual(order,['count','generate']);
 const reserved=x.statements.find(q=>q.sql.includes('INSERT INTO ai_budget_reservations'))!;
 assert.ok(reserved.params[3]>0.01,'estimate includes document and image input plus output');
 const content=provider==='openai'?bodies[1].input[0].content:bodies[1].messages[0].content;
 assert.equal(content.length,3);
 assert.equal(content[1].type,provider==='openai'?'input_file':'document');
 assert.equal(content[2].type,provider==='openai'?'input_image':'image');
});
test('failed attachment token count prevents paid generation and budget reservation',async()=>{
 const x=db('openai');let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('',{status:400});};
 const config=await loadHumasAiTask(x.pool,'publication_analysis');
 await assert.rejects(executeHumasAi(x.pool,{userId:99,taskCode:'publication_analysis',config,prompt:config.prompt,
  mediaParts:[{inlineData:{mimeType:'application/pdf',data:Buffer.from('pdf').toString('base64')}}]}),/AI_PROVIDER_TOKEN_COUNT_HTTP_400/);
 assert.equal(calls,1);assert.ok(!x.statements.some(q=>q.sql.includes('INSERT INTO ai_budget_reservations')));
});
test('analysis lock rejects concurrent issue work and rolls back on every outcome',async()=>{
 let locked=false,runs=0;const statements:string[]=[];
 const pool={connect:async()=>({query:async(sql:string)=>{statements.push(sql);if(sql==='BEGIN')return{rows:[]};if(sql==='ROLLBACK'){locked=false;return{rows:[]};}const acquired=!locked;locked=true;return{rows:[{acquired}]};},release(){}})} as unknown as Pool;
 let finish!:()=>void;
 const waiting=new Promise<void>(resolve=>{finish=resolve;});
 const first=withHumasAnalysisLock(pool,'gap:1',async()=>{runs++;await waiting;return 'saved';});
 await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(withHumasAnalysisLock(pool,'gap:1',async()=>{runs++;}),/AI_ANALYSIS_ALREADY_RUNNING/);
 finish();assert.equal(await first,'saved');assert.equal(runs,1);
 await assert.rejects(withHumasAnalysisLock(pool,'gap:1',async()=>{throw Error('PROVIDER_FAILED');}),/PROVIDER_FAILED/);
 assert.equal(statements.filter(s=>s==='ROLLBACK').length,3);
});

test('Gemini provider failure keeps quota consumed and records failed usage',async()=>{
 const x=db('gemini');globalThis.fetch=async()=>new Response('',{status:503});
 const config=await loadHumasAiTask(x.pool,'monitoring_analysis');
 await assert.rejects(executeHumasAi(x.pool,{userId:99,taskCode:'monitoring_analysis',config,prompt:config.prompt}),/AI_PROVIDER_HTTP_503/);
 assert.equal(x.statements.filter(q=>q.sql.includes('INSERT INTO ai_free_tier_daily_usage')).length,1);
 const failure=x.statements.find(q=>q.sql.includes("'failed'"));assert.equal(failure?.params[5],'AI_PROVIDER_HTTP_503');
 assert.ok(!x.statements.some(q=>q.sql.includes("'success'")));
});

for(const provider of ['gemini','openai','anthropic'])test(`evaluation uses Monitoring configuration but attributes ${provider} tokens, quota and budget to its own task`,async()=>{
 const x=db(provider,{evaluation:true});let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json(response(provider));};
 const config=await loadHumasAiTask(x.pool,'monitoring_analysis');
 const data=await executeHumasAi(x.pool,{userId:99,taskCode:'evaluation_analysis',config,prompt:config.prompt+' Ringkas evaluasi siklus.'});
 assert.deepEqual(data,{ok:true});assert.equal(calls,1);
 const logs=x.statements.filter(q=>q.sql.includes('INSERT INTO ai_usage_logs'));
 assert.equal(logs.length,1);assert.equal(logs[0].params[0],16);
 if(provider==='gemini')assert.equal(x.statements.find(q=>q.sql.includes('INSERT INTO ai_gemini_quota_feature_audit'))?.params[1],'evaluation_analysis');
 else assert.equal(x.statements.find(q=>q.sql.includes('INSERT INTO ai_budget_reservations'))?.params[1],16);
});
test('missing evaluation task fails before consuming Gemini quota or calling a provider',async()=>{
 const x=db('gemini',{evaluationMissing:true});let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
 const config=await loadHumasAiTask(x.pool,'monitoring_analysis');
 await assert.rejects(executeHumasAi(x.pool,{userId:99,taskCode:'evaluation_analysis',config,prompt:config.prompt}),/AI_EVALUATION_TASK_NOT_CONFIGURED/);
 assert.equal(calls,0);assert.ok(!x.statements.some(q=>q.sql.includes('INSERT INTO ai_free_tier_daily_usage')));
});
