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
