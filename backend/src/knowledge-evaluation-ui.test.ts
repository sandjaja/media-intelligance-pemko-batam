import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function fixture(){
 const control=(disabled=false)=>({disabled,isConnected:true,innerHTML:'Tombol',value:'',attributes:{} as Record<string,string>,setAttribute(key:string,value:string){this.attributes[key]=value;},removeAttribute(key:string){delete this.attributes[key];},classList:{add(){},remove(){}}});
 const button=control(),locked=control(true),field=control();
 const root={...control(),innerHTML:'',querySelectorAll:()=>[button,locked,field],querySelector:()=>field};
 const window:any={};
 const document={createElement:()=>control(),head:{appendChild(){}},getElementById:()=>root,querySelectorAll:()=>[],querySelector:()=>root};
 const source=readFileSync(new URL('../../knowledge-evaluation-ui.js',import.meta.url),'utf8')
  .replace('window.openKnowledgeEvaluation=','window.keTest={state,renderDetail,buttonAction};window.openKnowledgeEvaluation=');
 vm.runInNewContext(source,{window,document,URLSearchParams});
 return {root,button,locked,field,...window.keTest};
}
function detail(source:any){return {source:{workflow:{cycle_number:2,issue_id:9,issue_title:'MTQ'},...source},metrics:{cycleHours:11.5,publicationHours:null,clarificationHours:null,evidenceTotal:null},proposal:{},canManage:false};}

test('evaluation marks absent stages as not traversed and preserves present analysis',()=>{
 const x=fixture();x.state.detail=detail({});x.renderDetail();
 assert.equal((x.root.innerHTML.match(/Tahap ini tidak dilalui pada siklus ini\./g)||[]).length,3);
 x.state.detail=detail({strategy:{executive_summary:'Strategi tersimpan'},publication:{analysis:{executionAssessment:{assessment:'Publikasi tersimpan'}}},monitoring:{assessment:{cycleConclusion:'Monitoring tersimpan'}}});x.renderDetail();
 for(const text of ['Strategi tersimpan','Publikasi tersimpan','Monitoring tersimpan'])assert.ok(x.root.innerHTML.includes(text));
 assert.ok(!x.root.innerHTML.includes('Tahap ini tidak dilalui'));
 x.state.detail=detail({strategy:{},publication:{analysis:{}},monitoring:{}});x.renderDetail();
 assert.ok(!x.root.innerHTML.includes('Tahap ini tidak dilalui'));
 assert.ok(x.root.innerHTML.includes('Ringkasan analisis belum tersedia.'));
});

test('buttons show loading, reject duplicate actions and restore original disabled state after success or failure',async()=>{
 const x=fixture();let release!:()=>void,calls=0;
 const pending=x.buttonAction(x.button,'Menyimpan…',async()=>{calls++;await new Promise<void>(resolve=>release=resolve);});
 assert.ok(x.button.innerHTML.includes('ke-spinner'));assert.ok(x.button.innerHTML.includes('Menyimpan…'));
 assert.equal(x.button.disabled,true);assert.equal(x.root.attributes['aria-busy'],'true');
 await x.buttonAction(x.button,'Menyimpan…',async()=>{calls++;});assert.equal(calls,1);
 release();await pending;
 assert.equal(x.button.innerHTML,'Tombol');assert.equal(x.button.disabled,false);assert.equal(x.locked.disabled,true);assert.equal(x.state.busy,false);
 await assert.rejects(x.buttonAction(x.button,'Memuat…',async()=>{throw Error('Network failed');}),/Network failed/);
 assert.equal(x.button.innerHTML,'Tombol');assert.equal(x.button.disabled,false);assert.equal(x.root.attributes['aria-busy'],undefined);
});

function printFixture(fetcher:(path:string)=>Promise<Response>){
 const writes:string[]=[],requests:string[]=[];let printed=0,opened=0;
 const popup={closed:false,document:{images:[],open(){},write(html:string){writes.push(html);},close(){}},focus(){},print(){printed++;}};
 const window:any={MEDIA_BRANDING:{government_name:'Pemerintah Kota Batam',short_name:'Pemko Batam',logo_url:'https://example.invalid/logo.png'},open(){opened++;return popup;}};
 vm.runInNewContext(readFileSync(new URL('../../knowledge-evaluation-print.js',import.meta.url),'utf8'),{window,URLSearchParams,setTimeout:()=>0,fetch:async(path:string)=>{requests.push(path);return fetcher(path);}});
 return {window,writes,requests,popup,printed:()=>printed,opened:()=>opened};
}
const printEntry=(id:number)=>({workflowId:String(id),issueId:String(id),cycleNumber:1,title:'Isu '+id,leadOpd:'Kesbangpol',evaluation:{version:String(id),status:'APPROVED',summary:'Ringkasan <script>alert(1)</script>',lessons:['Pelajaran khusus isu '+id],strengths:['Pesan konsisten'],weaknesses:['Bukti terbatas'],recommendations:['Verifikasi kondisi terbaru'],tags:['organisasi'],metrics:{cycleHours:11.5,evidenceTotal:0,evidenceSufficiency:'INSUFFICIENT',conclusion:'Bukti belum memadai.'}}});

test('print all includes approved lessons beyond the visible page, retains search and uses official branding',async()=>{
 const x=printFixture(async(path)=>{
  const u=new URL(path,'https://example.invalid');assert.equal(u.searchParams.get('view'),'library');assert.equal(u.searchParams.get('q'),'organisasi');
  return Response.json({data:u.searchParams.get('page')==='1'?Array.from({length:20},(_,i)=>printEntry(i+1)):[printEntry(21),{...printEntry(22),evaluation:{status:'DRAFT'}}],total:22});
 });
 const pending=x.window.printKnowledgeLibrary({query:'organisasi'});assert.equal(x.opened(),1);await pending;
 assert.equal(x.requests.length,2);assert.equal(x.printed(),1);
 const html=x.writes.at(-1)!;
 for(const value of ['Isu 21','Pelajaran khusus isu 21','Kesbangpol','Pemerintah Kota Batam','logo.png','@page{size:A4 landscape','Belum memadai','Verifikasi kondisi terbaru'])assert.ok(html.includes(value),value);
 assert.ok(!html.includes('Isu 22'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.equal((html.match(/<tbody>/g)||[]).length,1);assert.equal((html.match(/<tr>/g)||[]).length,22);assert.ok(!html.includes('<article class="page">'));
});

test('single issue print reads the approved library version and rejects unapproved drafts',async()=>{
 for(const status of ['APPROVED','DRAFT']){
  const row=printEntry(9),x=printFixture(async(path)=>{assert.equal(path,'/api/knowledge/cycles/9?view=library');return Response.json({data:{source:{workflow:{id:9,issue_id:9,cycle_number:2,issue_title:'MTQ',lead_opd_name:'Kesra'}},saved:{version:'9',status,evaluation:row.evaluation,metrics:row.evaluation.metrics}}});});
  if(status==='DRAFT'){await assert.rejects(x.window.printKnowledgeLibrary({workflowId:9}),/disetujui Humas/);assert.equal(x.printed(),0);}
  else{await x.window.printKnowledgeLibrary({workflowId:9});assert.equal(x.printed(),1);assert.ok(x.writes.at(-1)!.includes('Kesra'));}
 }
});

test('blocked popup and failed API do not produce a misleading printed report',async()=>{
 const x=printFixture(async()=>new Response('',{status:503}));
 x.window.open=()=>null;await assert.rejects(x.window.printKnowledgeLibrary(),/Popup cetak diblokir/);assert.equal(x.requests.length,0);
 x.window.open=()=>x.popup;await assert.rejects(x.window.printKnowledgeLibrary(),/belum dapat dimuat/);assert.equal(x.printed(),0);assert.ok(x.writes.at(-1)!.includes('Cetak belum berhasil'));
});

test('approved evaluation is read-only even when a stale response still permits management',()=>{
 const x=fixture();x.state.detail={...detail({}),canManage:true,saved:{status:'APPROVED',evaluation:{summary:'Evaluasi disetujui',lessons:['Pelajaran disetujui']},ai:{provider:'gemini',model:'selected-model',promptVersion:1}}};x.renderDetail();
 assert.ok(!x.root.innerHTML.includes('<textarea'));
 assert.ok(!x.root.innerHTML.includes('data-ke-ai'));
 assert.ok(!x.root.innerHTML.includes('data-ke-save'));
 assert.ok(x.root.innerHTML.includes('Evaluasi disetujui dan dikunci.'));
 assert.ok(x.root.innerHTML.includes('selected-model'));
 assert.ok(x.root.innerHTML.includes('monitoring_analysis'));
});
