(()=>{
'use strict';
const ACTIVE='tab px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-sm';
const INACTIVE='tab px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm';
function activate(id){
 const ws=document.getElementById('workspace'); if(!ws||!id)return;
 ws.querySelectorAll(':scope > section[id$="Panel"]').forEach(p=>p.classList.add('hidden'));
 const panel=document.getElementById(id+'Panel'); if(panel)panel.classList.remove('hidden');
 ws.querySelectorAll('[data-tab]').forEach(b=>{b.className=b.dataset.tab===id?ACTIVE:INACTIVE});
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('#workspace [data-tab]'); if(!b)return;
 const id=b.dataset.tab; setTimeout(()=>activate(id),0);
});
window.adminActivateTab=activate;
})();