import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateDailyExecutiveBrief} from './executive-brief-daily.js';
import {readExecutiveBriefState,inspectExecutiveBriefRetry} from './executive-brief-cache.js';
import {isExecutiveBriefDue} from './executive-brief-schedule.js';
import {readExecutiveBriefInput,briefNewsSql,briefIssuesSql} from './executive-brief-input.js';
import {runLiveScheduledExecutiveBrief} from './cron-executive-brief.js';
import {encryptIntegrationCredential} from './integration-credentials.js';

const good={headline:'Prioritas kota',situation:'Data terverifikasi',implications:'Verifikasi tindak lanjut',actions:['Koordinasi OPD'],priority:'WATCH'};
function fixture(empty=false,quota=true){
 let today:any=null,saved:any=null,reservations=0,logs:any[]=[],snapshotReads=0;
 const previous={brief_date:'2026-10-16',status:'ready',brief_json:{...good,mode:'ai'},generated_at:'2026-10-16T02:30:00Z'};
 const query=async(sql:string,p:any[]=[])=>{
  if(sql.startsWith('INSERT INTO executive_brief_daily_cache')){if(today)return{rows:[]};today={status:'running',error_code:null};return {rows:[{brief_date:p[0]}]};}
  if(sql.startsWith('UPDATE executive_brief_daily_cache')&&sql.includes("error_code='RETRY_RUNNING:'")){if(today?.status!=='failed'||String(today.error_code||'').startsWith('RETRY_'))return{rows:[]};today={status:'running',error_code:'RETRY_RUNNING:'+today.error_code};return {rows:[{brief_date:p[0]}]};}
  if(sql.startsWith('UPDATE executive_brief_daily_cache')&&sql.includes("SET status='ready'")){saved=JSON.parse(p[2]);today={status:'ready'};return{rows:[{brief_date:p[0]}]};}
  if(sql.startsWith('UPDATE executive_brief_daily_cache')&&sql.includes("SET status='failed'")){today={status:'failed',error_code:sql.includes('RETRY_FAILED:')?'RETRY_FAILED:'+p[1]:p[2]};return{rows:[]};}
  if(sql.includes("FROM executive_brief_daily_cache"))return{rows:sql.includes("status='ready'")?[previous]:today?[today]:[]};
  if(sql.includes('SELECT id FROM organizations'))return{rows:[{id:'1'}]};
  if(sql===briefNewsSql){snapshotReads++;return {rows:[{total:empty?0:2,negative:0,high_risk:0,items:empty?[]:[{id:'9',title:'Tin mới',summary:'Nội dung',risk_score:50,channel:'online'}]}]};}
  if(sql===briefIssuesSql)return{rows:[{total:empty?0:1,active:empty?0:1,watch:0,items:empty?[]:[{id:'4',title:'Isu berjalan',status:'active'}]}]};
  if(sql.includes('FROM collection_scheduler_runs'))return{rows:[{status:'RUNNING',started_at:'2026-10-17T01:50:00Z'}]};
  if(sql.includes('SELECT c.credential_ciphertext'))return{rows:[{credential_ciphertext:encryptIntegrationCredential('test-key-only')}]};
  if(sql.startsWith('SELECT m.code'))return{rows:[{code:'mock-gemini-1'},{code:'mock-gemini-2'}]};
  if(sql.startsWith('INSERT INTO ai_free_tier_daily_usage')){reservations++;return{rows:quota?[{model_id:'1'}]:[]};}
  if(sql.startsWith('INSERT INTO ai_usage_logs'))logs.push(p);
  return{rows:[]};
 };
 return{pool:{query} as any,saved:()=>saved,today:()=>today,reservations:()=>reservations,logs:()=>logs,snapshotReads:()=>snapshotReads};
}
async function withProvider(fn:(calls:()=>number)=>Promise<void>,status=503){
 const previousFetch=globalThis.fetch,previousKey=process.env.INTEGRATION_CREDENTIAL_KEY;process.env.INTEGRATION_CREDENTIAL_KEY='test-encryption-key';let calls=0;
 globalThis.fetch=async(input,options)=>{assert.ok(String(input).startsWith('https://generativelanguage.googleapis.com/'));calls++;const request=JSON.parse(String(options?.body));assert.equal(request.generationConfig.maxOutputTokens,2048);return status===200?Response.json({candidates:[{content:{parts:[{text:JSON.stringify(good)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:50}}):new Response('{}',{status});};
 try{await fn(()=>calls);}finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.INTEGRATION_CREDENTIAL_KEY;else process.env.INTEGRATION_CREDENTIAL_KEY=previousKey;}
}
test('503 makes one provider attempt, retains previous brief, and permits one explicit manual retry only',async()=>withProvider(async calls=>{
 const x=fixture();assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17')).status,'failed');assert.equal(calls(),1);assert.equal(x.reservations(),1);assert.equal(x.saved(),null);assert.match(x.today().error_code,/503/);assert.equal(x.logs().length,1);
 const before=await readExecutiveBriefState(x.pool,'2026-10-17');assert.equal(before.brief?.brief_date,'2026-10-16');assert.equal(before.outdated,true);assert.match(before.message,/503/);assert.equal(before.retryAvailable,true);
 assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17')).status,'already_claimed');assert.equal(calls(),1);
 assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17',true)).status,'failed');assert.equal(calls(),2);
 assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17',true)).status,'already_claimed');assert.equal(calls(),2);
 const after=await readExecutiveBriefState(x.pool,'2026-10-17');assert.equal(after.retryAvailable,false);assert.match(after.message,/sudah digunakan/);assert.equal(after.brief?.brief_date,'2026-10-16');
 assert.match((await inspectExecutiveBriefRetry(x.pool,'2026-10-17')).message,/503/);
}));
test('successful brief stores period, source coverage and incomplete collection status without collection retries',async()=>withProvider(async calls=>{
 const x=fixture();assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17')).status,'created');assert.equal(calls(),1);assert.equal(x.saved().coverage.collection.status,'RUNNING');assert.equal(x.saved().coverage.news,2);assert.equal(x.saved().source_count,2);assert.equal(x.saved().mode,'ai');assert.equal(x.saved().period.timezone,'Asia/Jakarta');assert.equal(x.snapshotReads(),1);
},200));
test('empty eligible snapshot uses zero AI requests and records an explicitly labelled database result',async()=>withProvider(async calls=>{
 const x=fixture(true);assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17')).status,'created');assert.equal(calls(),0);assert.equal(x.reservations(),0);assert.equal(x.saved().mode,'database-no-data');assert.equal(x.saved().source_count,0);assert.match(x.saved().situation,/tidak membuktikan/);
}));
test('quota exhaustion fails closed without being mislabelled as a Gemini 503',async()=>withProvider(async calls=>{
 const x=fixture(false,false);assert.equal((await generateDailyExecutiveBrief(x.pool,'2026-10-17')).status,'failed');assert.equal(calls(),0);assert.equal(x.today().error_code,'GEMINI_QUOTA_UNAVAILABLE');
}));
test('Hobby delayed clock ticks within the day remain due, but never before schedule or while disabled',()=>{
 const setting={enabled:true,hour_wib:9,minute_wib:30,timezone:'Asia/Jakarta' as const};
 assert.equal(isExecutiveBriefDue(setting,new Date('2026-10-17T02:29:00Z')),false);
 assert.equal(isExecutiveBriefDue(setting,new Date('2026-10-17T03:29:00Z')),true);
 assert.equal(isExecutiveBriefDue({...setting,enabled:false},new Date('2026-10-17T03:29:00Z')),false);
 assert.equal(isExecutiveBriefDue(setting,new Date('2026-10-17T17:00:00Z')),false);
});
for(const [mainEnabled,briefEnabled,expected] of [[false,true,'disabled'],[true,false,'disabled'],[true,true,'created']] as const){
 test(`live cron main=${mainEnabled} brief=${briefEnabled}: ${expected}`,async()=>{
  let executed=0;const query=async(sql:string)=>{if(sql.includes('FROM collection_scheduler_config'))return{rows:[{enabled:mainEnabled,run_time:'08:00:00'}]};if(sql.includes('FROM executive_brief_schedule_settings'))return{rows:[{enabled:briefEnabled,hour_wib:9,minute_wib:30,timezone:'Asia/Jakarta'}]};if(sql.includes('FROM executive_brief_daily_cache'))return{rows:[]};throw Error('Unexpected query '+sql);};
  const result=await runLiveScheduledExecutiveBrief({query} as any,new Date('2026-10-17T03:20:00Z'),async()=>{executed++;return{status:'created',date:'2026-10-17'};});assert.equal(result.status,expected);assert.equal(executed,expected==='created'?1:0);
 });
}
test('input snapshot bounds period, news, issues and untrusted source text',async()=>{
 const queries:any[]=[];const query=async(sql:string,p:any[])=>{queries.push({sql,p});if(sql.includes('SELECT id FROM organizations'))return{rows:[{id:'1'}]};if(sql===briefNewsSql)return{rows:[{total:200,items:Array.from({length:30},()=>({title:'x'.repeat(1000),summary:'x'.repeat(2000)}))}]};if(sql===briefIssuesSql)return{rows:[{total:50,items:Array.from({length:20},()=>({title:'x'.repeat(1000)}))}]};return{rows:[]};};
 const input=await readExecutiveBriefInput({query} as any,null,new Date('2026-10-17T02:30:00Z'));assert.equal(input.period.from,'2026-10-16T02:30:00.000Z');assert.equal(input.news.items.length,10);assert.equal(input.issues.items.length,5);assert.equal(input.news.items[0].summary.length,500);assert.equal(input.news.items[0].title.length,240);assert.ok(queries.every(x=>x.sql.startsWith('SELECT')||x.sql.startsWith('WITH')));
});
