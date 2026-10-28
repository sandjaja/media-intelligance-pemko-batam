import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../social-intelligence.js',import.meta.url),'utf8');
const modalSource=source.slice(source.indexOf('function apifyJobPanel('),source.indexOf('\nasync function loadAccountPerformance'));
function setup(platform='instagram',resume=false){
 const elements=new Map<string,any>();
 const element=(id:string)=>{if(!elements.has(id))elements.set(id,{isConnected:true,value:id==='socialCollectPlatform'?platform:id==='socialApifyVideoLimit'?'10':'',textContent:'',innerHTML:'',dataset:{},classList:{toggle(){},add(){}},remove(){this.isConnected=false;},insertAdjacentElement(){},addEventListener(){}});return elements.get(id);};
 const calls:string[]=[];let loads=0,polls=0;
 const step={kind:platform==='instagram'?'instagram_posts':'tiktok_posts',status:'QUEUED',cap:0.3};const job={jobId:'test-job',status:'RUNNING',steps:[step]};
 const context=vm.createContext({document:{getElementById:element,body:{insertAdjacentHTML(){element("socialCollectModal").isConnected=true;}}},$:element,esc:String,setTimeout:(fn:()=>void)=>fn(),load:async()=>{loads++;},api:async(path:string)=>{
  calls.push(path);
  if(path.includes('/actors?'))return{data:[]};
  if(path.endsWith('/latest'))return{data:resume?job:null};
  if(path.endsWith('/jobs'))return{data:job};
  if(path.endsWith('/advance')){polls++;return{data:{...job,status:'DONE',steps:[{...step,status:'DONE',runId:'run_test123',counts:{datasetItems:10,succeeded:9,outOfScope:1,failed:0,skipped:0,rejected:0}}]}};}
  throw Error('Unexpected request '+path);
 }});
 vm.runInContext(modalSource+';collectModal();',context);
 return{element,calls,loads:()=>loads,polls:()=>polls,run:()=>element('socialCollectRun').onclick()};
}
for(const platform of ['instagram','tiktok','apify'])test(platform+' executes enabled Actor job and preserves final counts without preview',async()=>{
 const ui=setup(platform);await ui.run();assert.equal(ui.calls.filter(x=>x.endsWith('/jobs')).length,1);assert.equal(ui.polls(),1);assert.equal(ui.calls.some(x=>x.includes('preview')),false);assert.match(ui.element('socialCollectStatus').innerHTML,/Penarikan selesai/);assert.match(ui.element('socialCollectStatus').innerHTML,/tersimpan\/diperbarui 9/);assert.equal(ui.loads(),1);
});
test('reopening resumes the existing server job without starting another',async()=>{
 const ui=setup('instagram',true);for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(ui.calls.some(x=>x.endsWith('/jobs')),false);assert.equal(ui.polls(),1);assert.match(ui.element('socialCollectStatus').innerHTML,/run_test123/);
});
