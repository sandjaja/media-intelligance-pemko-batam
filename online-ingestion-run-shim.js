(()=>{
  const nativeFetch=window.fetch.bind(window);
  const isRunRequest=(input,options)=>{
    const url=typeof input==='string'?input:String(input?.url||'');
    const method=String(options?.method||input?.method||'GET').toUpperCase();
    return method==='POST'&&/(?:^|\/)api\/ingestion\/run(?:\?.*)?$/.test(url);
  };
  window.fetch=async function(input,options={}){
    if(!isRunRequest(input,options))return nativeFetch(input,options);
    const runUrl=typeof input==='string'?input:String(input?.url||'');
    const base=runUrl.replace(/\/ingestion\/run(?:\?.*)?$/,'');
    const common={credentials:'include',headers:{...(options.headers||{})}};
    try{
      const healthRes=await nativeFetch(`${base}/ingestion/status`,common);
      const health=await healthRes.json().catch(()=>({}));
      if(!healthRes.ok)return new Response(JSON.stringify(health),{status:healthRes.status,headers:{'content-type':'application/json'}});
      const sources=(health.sources||[]).filter(s=>s.active!==false&&s.url&&String(s.category||'').toLowerCase()==='online');
      const results=[];
      for(const source of sources){
        try{
          const res=await nativeFetch(`${base}/online/sources/${encodeURIComponent(source.id)}/run`,{...common,method:'POST',headers:{'content-type':'application/json',...(options.headers||{})}});
          const body=await res.json().catch(()=>({}));
          if(!res.ok)results.push({source:source.name,sourceId:String(source.id),error:body.message||body.error||`HTTP ${res.status}`});
          else results.push(body);
        }catch(error){results.push({source:source.name,sourceId:String(source.id),error:error instanceof Error?error.message:String(error)});}
      }
      return new Response(JSON.stringify({results,mode:'per-source-v1'}),{status:200,headers:{'content-type':'application/json'}});
    }catch(error){
      return new Response(JSON.stringify({error:'ONLINE_INGESTION_FANOUT_FAILED',message:error instanceof Error?error.message:String(error)}),{status:502,headers:{'content-type':'application/json'}});
    }
  };
})();
