(()=>{
'use strict';
if(window.__authSessionBridgeInstalled)return;
window.__authSessionBridgeInstalled=true;
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const previousFetch=window.fetch.bind(window);
window.fetch=function(input,init={}){
  try{
    const raw=typeof input==='string'?input:(input?.url||'');
    const url=new URL(raw,location.origin);
    const method=(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    if(method==='GET'&&url.pathname==='/api/me'&&document.body?.dataset?.auth!=='ok'){
      input=API+'/auth/session';
    }
  }catch{}
  return previousFetch(input,init);
};
})();
