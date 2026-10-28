import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function moduleRuntime(file:string,exports:string){
 const source=readFileSync(new URL('../../'+file,import.meta.url),'utf8'),end=source.lastIndexOf('})();');
 const nodes=new Map<string,any>();const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',insertAdjacentHTML(_p:string,html:string){this.innerHTML+=html;},querySelectorAll:()=>[]});return nodes.get(id);};
 const window:any={addEventListener(){}};const context=vm.createContext({window,document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},Date,Intl,Set,Map,console,fetch(){throw Error('Unexpected network request');}});
 vm.runInContext(source.slice(0,end)+'window.kpiTest={'+exports+'};'+source.slice(end),context);return{api:window.kpiTest,nodes};
}
test('Owned KPI filters both publications and narrative clusters, then resets to the complete list',()=>{
 const {api}=moduleRuntime('owned-channel-intelligence.js','state,getFiltered');
 api.state.rows=[{id:1,sentiment:'negative',risk_level:'high'},{id:2,sentiment:'positive',risk_level:'low'},{id:3,sentiment:'neutral',risk_level:'critical'}];
 api.state.clusters=api.state.rows.map((r:any)=>({id:r.id,member_count:1,channel_count:1,members:[{mentionId:r.id}]}));
 api.state.kpiFilter='NEGATIVE';let result=api.getFiltered();assert.equal(JSON.stringify(result.rows.map((r:any)=>r.id)),'[1]');assert.equal(JSON.stringify(result.clusters.map((c:any)=>c.id)),'[1]');
 api.state.kpiFilter='HIGH_RISK';result=api.getFiltered();assert.equal(JSON.stringify(result.rows.map((r:any)=>r.id)),'[1,3]');assert.equal(JSON.stringify(result.clusters.map((c:any)=>c.id)),'[1,3]');
 api.state.kpiFilter='ALL';assert.equal(api.getFiltered().rows.length,3);assert.equal(api.getFiltered().clusters.length,3);
 api.state.clusters=[{id:9,member_count:3,channel_count:2,members:[{mentionId:1},{mentionId:2},{mentionId:3}]}];api.state.statusFilter='amplified';api.state.kpiFilter='NEGATIVE';result=api.getFiltered();assert.equal(result.clusters.length,1);assert.equal(result.clusters[0].members.length,1);assert.equal(result.clusters[0].matchingCount,1);
});
test('print KPI keeps baseline totals while the visible article list follows selected sentiment',()=>{
 const {api,nodes}=moduleRuntime('print-archive.js',"paintArchive,setRows:v=>allRows=v,setFilter:v=>kpiFilter=v");const now=new Date().toISOString();api.setRows([{id:1,title:'Negative item',sentiment:'negative',risk_level:'high',edition_date:now},{id:2,title:'Positive item',sentiment:'positive',risk_level:'low',edition_date:now},{id:3,title:'Critical item',sentiment:'neutral',risk_level:'critical',edition_date:now}]);
 api.setFilter('NEGATIVE');api.paintArchive();assert.ok(nodes.get('paList').innerHTML.includes('Negative item'));assert.ok(!nodes.get('paList').innerHTML.includes('Positive item'));assert.match(nodes.get('paStats').innerHTML,/Total Clipping<\/div><b class="text-2xl">3/);assert.match(nodes.get('paStats').innerHTML,/aria-pressed="true"/);
 api.setFilter('ALL');api.paintArchive();assert.ok(nodes.get('paList').innerHTML.includes('Positive item'));
});
test('selected KPI label contrast exceeds WCAG AA in light and dark palettes',()=>{
 const luminance=(hex:string)=>{const rgb=hex.match(/../g)!.map(n=>parseInt(n,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;};
 for(const [fg,bg] of [['0c4a6e','e0f2fe'],['ecfeff','164e63']]){const values=[luminance(fg),luminance(bg)].sort((a,b)=>a-b);assert.ok((values[1]+0.05)/(values[0]+0.05)>=4.5);}
});
