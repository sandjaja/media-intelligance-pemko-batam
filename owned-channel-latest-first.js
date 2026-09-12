(()=>{
  'use strict';
  if(window.__ownedLatestFirstInstalled)return;
  window.__ownedLatestFirstInstalled=true;
  const originalFetch=window.fetch.bind(window);
  const timeOf=row=>{
    const raw=row?.published_at||row?.captured_at||row?.created_at||row?.updated_at||null;
    const t=raw?Date.parse(raw):0;
    return Number.isFinite(t)?t:0;
  };
  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      const method=(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
      if(method==='GET'&&/\/api\/social\/mentions(?:\?|$)/.test(url)){
        const clone=response.clone();
        const body=await clone.json();
        if(Array.isArray(body?.data)){
          body.data.sort((a,b)=>timeOf(b)-timeOf(a)||(Number(b?.id)||0)-(Number(a?.id)||0));
          const headers=new Headers(response.headers);
          headers.set('content-type','application/json; charset=utf-8');
          return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers});
        }
      }
    }catch(error){
      console.warn('Latest-first response normalization skipped',error);
    }
    return response;
  };
})();
