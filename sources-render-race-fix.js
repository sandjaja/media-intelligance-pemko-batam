(()=>{
'use strict';
const original=window.renderSources;
if(typeof original!=='function'||window.__sourcesRenderRaceFix)return;
window.__sourcesRenderRaceFix=true;
const root=()=>document.getElementById('sources');
const hasManagedView=el=>!!el?.querySelector('[data-di-group],#ownedBulkForm,#kwV2Form,#taxonomyManagement,#issueManagement');
function recover(){
 const el=root();
 if(!el||el.classList.contains('hidden')||hasManagedView(el))return;
 if(typeof window.openSourceManagement==='function')Promise.resolve(window.openSourceManagement()).catch(()=>{});
}
window.renderSources=function(){
 const el=root();
 if(!el)return original();
 if(!el.classList.contains('hidden')&&hasManagedView(el))return;
 const result=original();
 setTimeout(recover,0);
 return result;
};
window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='sources')setTimeout(recover,30);});
const observer=new MutationObserver(()=>{const el=root();if(el&&!el.classList.contains('hidden')&&!hasManagedView(el))setTimeout(recover,30);});
const start=()=>{const el=root();if(el)observer.observe(el,{childList:true,subtree:false});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();