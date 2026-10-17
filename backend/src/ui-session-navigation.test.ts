import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function runtime(fetcher:(input:any,init?:any)=>Promise<Response>){
 const listeners=new Map<string,Function[]>(),elements=new Map<string,any>(),stored=new Map<string,string>(),timers:Function[]=[];
 const on=(name:string,fn:Function)=>listeners.set(name,[...(listeners.get(name)||[]),fn]);
 const node=(id='')=>({id,style:{},dataset:{},innerHTML:'',textContent:'',classList:{values:new Set<string>(),add(x:string){this.values.add(x);},remove(x:string){this.values.delete(x);},contains(x:string){return this.values.has(x);},toggle(x:string,on:boolean){on?this.add(x):this.remove(x);}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},setAttribute(){},remove(){elements.delete(this.id);}});
 const append=(el:any)=>{if(el.id)elements.set(el.id,el);};
 const document:any={readyState:'loading',body:{dataset:{auth:'checking'},appendChild:append},head:{appendChild:append},addEventListener:on,querySelector:()=>null,querySelectorAll:()=>[],getElementById:(id:string)=>elements.get(id)||null,createElement:()=>node()};
 const storage={getItem:(k:string)=>stored.get(k)||null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)};
 const window:any={fetch:fetcher,addEventListener:on,dispatchEvent:(e:any)=>{for(const fn of listeners.get(e.type)||[])fn(e);}};
 const context=vm.createContext({window,document,location:{origin:'https://app.test',href:'https://app.test/index.html',search:'',replace(){throw Error('Unexpected redirect');}},localStorage:storage,sessionStorage:storage,URL,URLSearchParams,Response,console,CustomEvent:class{constructor(public type:string,public options:any){}get detail(){return this.options.detail;}},MutationObserver:class{observe(){}disconnect(){}},setTimeout:(fn:Function,ms:number)=>{if(ms<1000)timers.push(fn);return 1;},clearTimeout(){},setInterval(){return 1;},fetch:(...args:any[])=>window.fetch(...args)});
 const run=(name:string)=>vm.runInContext(readFileSync(new URL('../../'+name,import.meta.url),'utf8'),context);
 return {document,window,elements,stored,timers,run,node,context,emit:(type:string,detail?:any)=>window.dispatchEvent({type,detail})};
}

test('concurrent API 401s restore via one non-rotating session request',async()=>{
 let restored=false,sessions=0;
 const x=runtime(async(input)=>{if(String(input).endsWith('/auth/session')){sessions++;await Promise.resolve();restored=true;return Response.json({user:{id:'1'}});}return Response.json({}, {status:restored?200:401});});
 x.run('auth-session-guard.js');const pending=Promise.all([x.window.fetch('/api/articles'),x.window.fetch('/api/opd')]);
 for(let i=0;i<20;i++){await Promise.resolve();for(const fn of x.timers.splice(0))fn();}
 const responses=await pending;assert.equal(sessions,1);assert.ok(responses.every(r=>r.ok));
});

test('temporary session failure is not a confirmed logout',async()=>{
 const x=runtime(async(input)=>Response.json({}, {status:String(input).endsWith('/auth/session')?503:401}));x.run('auth-session-guard.js');
 const response=await x.window.fetch('/api/articles');assert.equal(response.status,503);assert.equal((await response.json()).error,'SESSION_CHECK_UNAVAILABLE');
});

test('bootstrap session 401 never invokes rotating refresh',async()=>{
 const paths:string[]=[];const x=runtime(async(input)=>{paths.push(String(input));return Response.json({}, {status:401});});x.run('auth-session-guard.js');x.run('auth-session-bridge.js');
 assert.equal((await x.window.fetch('/api/me')).status,401);assert.deepEqual(paths,['/api/auth/session']);
});

test('navigation waits for authentication and restores the account menu without dashboard scope',()=>{
 let calls=0;const x=runtime(async()=>{calls++;return new Promise<Response>(()=>{});});
 for(const id of ['tabs','opdSelect','dashboard','commandCenterFilters','mediamonitoring'])x.elements.set(id,x.node(id));
 x.document.querySelectorAll=(s:string)=>s==='main > section'?[x.elements.get('dashboard'),x.elements.get('commandCenterFilters'),x.elements.get('mediamonitoring')]:[];
 x.run('app.js');assert.equal(calls,0);
 x.window.MEDIA_CURRENT_USER={id:'44',roles:['humas']};x.document.body.dataset.auth='ok';x.stored.set('mi.lastTab.44','mediamonitoring');x.emit('media:authenticated');x.timers.shift()?.();
 assert.equal(x.document.body.dataset.activeTab,'mediamonitoring');assert.equal(x.elements.get('commandCenterFilters').classList.contains('hidden'),true);assert.equal(x.stored.get('mi.lastTab.44'),'mediamonitoring');
});

test('a remembered menu outside the current role falls back to dashboard',()=>{
 const x=runtime(async()=>new Promise<Response>(()=>{}));for(const id of ['tabs','opdSelect','dashboard','commandCenterFilters','strategy'])x.elements.set(id,x.node(id));x.run('app.js');
 x.window.MEDIA_CURRENT_USER={id:'55',roles:['viewer']};x.document.body.dataset.auth='ok';x.stored.set('mi.lastTab.55','strategy');x.emit('media:authenticated');x.timers.shift()?.();
 assert.equal(x.document.body.dataset.activeTab,'dashboard');assert.equal(x.stored.get('mi.lastTab.55'),'dashboard');
});

test('late dashboard refresh on another menu cannot reveal scope or fetch dashboard data',async()=>{
 let calls=0;const x=runtime(async()=>{calls++;return Response.json({data:[]});});const box=x.node('commandCenterFilters');x.elements.set(box.id,box);x.document.body.dataset.auth='ok';x.document.body.dataset.activeTab='highlights';x.run('command-center.js');
 await x.window.renderCommandCenter();assert.equal(calls,0);assert.equal(box.classList.contains('hidden'),true);
});
