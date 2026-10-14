import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../social-intelligence.js',import.meta.url),'utf8');
const modalSource=source.slice(source.indexOf('function collectModal()'),source.indexOf('\nasync function loadAccountPerformance'));
function setup(confirmRun=true,importError?:string){
 const elements=new Map<string,any>();
 const element=(id:string)=>{if(!elements.has(id))elements.set(id,{value:id==='socialCollectPlatform'?'tiktok':id==='socialApifyVideoLimit'?'10':'',textContent:'',innerHTML:'',dataset:{},classList:{toggle(){},add(){}},remove(){},insertAdjacentElement(){},addEventListener(){}});return elements.get(id);};
 const calls:string[]=[];let imports=0,loads=0;
 const context=vm.createContext({document:{getElementById:element,body:{insertAdjacentHTML(){}},createElement:()=>element('history')},$:element,window:{confirm:()=>confirmRun},canManage:()=>true,esc:String,setTimeout:(fn:()=>void)=>fn(),load:async()=>{loads++;},api:async(path:string)=>{
  calls.push(path);
  if(path.includes('cost-history'))return{data:{}};
  if(path.endsWith('start-direct'))return{data:{runId:'run_test123'}};
  if(path.endsWith('import-external')){imports++;if(importError)throw Error(importError);if(imports===1)throw Error('APIFY_EXTERNAL_RUN_NOT_VERIFIED');return{data:{datasetItems:10,succeeded:10,outOfScope:0}};}
  throw Error('Unexpected request '+path);
 }});
 vm.runInContext(modalSource+';collectModal();',context);
 return{element,calls,loads:()=>loads,run:()=>element('socialCollectRun').onclick()};
}
test('TikTok starts once, waits, imports and preserves the result instead of preview blockers',async()=>{
 const ui=setup();await ui.run();
 assert.equal(ui.calls.filter(x=>x.endsWith('start-direct')).length,1);
 assert.equal(ui.calls.filter(x=>x.endsWith('import-external')).length,2);
 assert.equal(ui.calls.some(x=>x.includes('manual-preview')),false);
 assert.match(ui.element('socialCollectStatus').textContent,/Impor otomatis selesai.*berhasil: 10/);
 assert.equal(ui.element('socialCollectStatus').innerHTML,'');
 assert.equal(ui.element('socialCollectRun').textContent,'Tutup');
 assert.equal(ui.loads(),1);
});
test('cancelling sends no start or preview request',async()=>{
 const ui=setup(false);await ui.run();
 assert.equal(ui.calls.some(x=>x.includes('start-direct')||x.includes('import-external')||x.includes('manual-preview')),false);
 assert.equal(ui.element('socialCollectRun').disabled,false);
 assert.equal(ui.element('socialCollectRun').textContent,'Tarik TikTok via Apify');
});
test('import error preserves the Run ID for recovery without restarting the Actor',async()=>{
 const ui=setup(true,'APIFY_EXTERNAL_RUN_IMPORT_FAILED');await ui.run();
 assert.equal(ui.calls.filter(x=>x.endsWith('start-direct')).length,1);
 assert.match(ui.element('socialCollectStatus').textContent,/run_test123.*APIFY_EXTERNAL_RUN_IMPORT_FAILED/);
 assert.equal(ui.element('socialApifyRunId').value,'run_test123');
 assert.equal(ui.element('socialCollectRun').textContent,'Tutup');
});
