(()=>{
'use strict';
const params=new URLSearchParams(location.search);
if(params.get('from')!=='admin')return;
const style=document.createElement('style');
style.id='adminReturnTransitionStyle';
style.textContent='#authGate{visibility:hidden!important}';
document.head.appendChild(style);
function mount(){if(document.getElementById('adminReturnTransition'))return;const box=document.createElement('div');box.id='adminReturnTransition';box.style.cssText='position:fixed;inset:0;z-index:99999;background:#030611;display:grid;place-items:center;color:#cbd5e1;font-family:Inter,ui-sans-serif,system-ui,sans-serif';box.innerHTML='<div style="text-align:center"><div style="width:34px;height:34px;border:3px solid #334155;border-top-color:#22d3ee;border-radius:50%;margin:0 auto 14px;animation:miSpin .8s linear infinite"></div><div style="font-size:12px;font-weight:800;letter-spacing:.16em">MEMBUKA COMMAND CENTER</div></div><style>@keyframes miSpin{to{transform:rotate(360deg)}}</style>';document.body.appendChild(box)}
function clear(removeQuery=true){document.getElementById('adminReturnTransition')?.remove();document.getElementById('adminReturnTransitionStyle')?.remove();if(removeQuery){const u=new URL(location.href);u.searchParams.delete('from');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.addEventListener('media:authenticated',()=>clear(true),{once:true});
setTimeout(()=>clear(false),3000);
})();