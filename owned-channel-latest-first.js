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
  const ownedVisible=()=>{
    const el=document.getElementById('ownedchannels');
    return Boolean(el&&!el.classList.contains('hidden'));
  };
  window.fetch=async function(input,init){
    let requestInput=input;
    try{
      const rawUrl=typeof input==='string'?input:(input?.url||'');
      const method=(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
      if(method==='GET'&&ownedVisible()&&/\/api\/social\/mentions(?:\?|$)/.test(rawUrl)){
        const parsed=new URL(rawUrl,window.location.origin);
        const q=new URLSearchParams();
        q.set('limit',parsed.searchParams.get('limit')||'100');
        const opdId=parsed.searchParams.get('opdId');
        if(opdId)q.set('opdId',opdId);
        q.set('_ts',String(Date.now()));
        requestInput=`/api/social/owned-publications?${q.toString()}`;
      }
    }catch(error){
      console.warn('Owned latest-first route normalization skipped',error);
    }
    const response=await originalFetch(requestInput,init);
    try{
      const url=typeof requestInput==='string'?requestInput:(requestInput?.url||'');
      const method=(init?.method||(typeof requestInput!=='string'&&requestInput?.method)||'GET').toUpperCase();
      if(method==='GET'&&/\/api\/social\/(?:mentions|owned-publications)(?:\?|$)/.test(url)){
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
