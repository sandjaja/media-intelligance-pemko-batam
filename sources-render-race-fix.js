(()=>{
'use strict';
const original=window.renderSources;
if(typeof original!=='function'||window.__sourcesRenderRaceFix)return;
window.__sourcesRenderRaceFix=true;
window.renderSources=function(){
 const root=document.getElementById('sources');
 if(!root)return original();
 const isVisible=!root.classList.contains('hidden');
 const hasManagedView=!!root.querySelector('[data-di-group],#ownedBulkForm,#kwV2Form,#taxonomyManagement,#issueManagement');
 if(isVisible&&hasManagedView)return;
 return original();
};
})();