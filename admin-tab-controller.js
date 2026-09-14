(()=>{
'use strict';
const ACTIVE='tab px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-sm';
const INACTIVE='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';
const STORAGE_KEY='mi.admin.activeTab';
function validId(id){return typeof id==='string'&&/^[a-z0-9_-]+$/i.test(id)}
function remember(id){if(!validId(id))return;try{sessionStorage.setItem(STORAGE_KEY,id)}catch{}}
function remembered(){try{const id=sessionStorage.getItem(STORAGE_KEY);return validId(id)?id:null}catch{return null}}
function activate(id,{persist=true}={}){
 const ws=document.getElementById('workspace'); if(!ws||!id)return false;
 const panel=document.getElementById(id+'Panel');
 const button=ws.querySelector(`[data-tab="${id}"]`);
 if(!panel||!button)return false;
 ws.querySelectorAll(':scope > section[id$="Panel"]').forEach(p=>p.classList.add('hidden'));
 panel.classList.remove('hidden');
 ws.querySelectorAll('[data-tab]').forEach(b=>{b.className=b.dataset.tab===id?ACTIVE:INACTIVE});
 if(persist)remember(id);
 return true;
}
function restore(){const id=remembered();return id?activate(id,{persist:false}):false}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('#workspace [data-tab]'); if(!b)return;
 const id=b.dataset.tab;remember(id);setTimeout(()=>activate(id),0);
});
const observer=new MutationObserver(()=>{restore()});
const start=()=>{
 const ws=document.getElementById('workspace');
 if(!ws)return;
 observer.observe(ws,{childList:true,subtree:true});
 restore();
 setTimeout(restore,150);
 setTimeout(restore,500);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
window.adminActivateTab=(id)=>activate(id);
window.adminRememberTab=remember;
})();