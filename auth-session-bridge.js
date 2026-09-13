(()=>{
'use strict';
if(window.__authSessionBridgeInstalled)return;
window.__authSessionBridgeInstalled=true;
const API=(window.MEDIA_INTELLIGENCE_API||'/api').replace(/\/$/,'');
const previousFetch=window.fetch.bind(window);
window.fetch=async function(input,init={}){
  let raw='';
  let method='GET';
  try{
    raw=typeof input==='string'?input:(input?.url||'');
    const url=new URL(raw,location.origin);
    method=(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    if(method==='GET'&&url.pathname==='/api/me'&&document.body?.dataset?.auth!=='ok'){
      input=API+'/auth/session';
      raw=input;
    }
  }catch{}

  const response=await previousFetch(input,init);

  try{
    const url=new URL(raw||((typeof input==='string'?input:(input?.url||''))),location.origin);
    if(method==='POST'&&url.pathname==='/api/auth/login'&&response.ok){
      const remember=Boolean(document.getElementById('rememberLogin')?.checked);
      await previousFetch(API+'/auth/persist',{
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
        body:JSON.stringify({rememberMe:remember}),
      });
    }
  }catch{}

  return response;
};
})();
