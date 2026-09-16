(()=>{
  // Compatibility guard: Communication Gap backend validates query params.
  // Strip cache-buster params before requests reach the API.
  if(!window.__cgPhase3FetchFix){
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      try{
        const raw=typeof input==='string'?input:input?.url;
        if(raw&&raw.includes('/api/intelligence/communication-gaps')){
          const u=new URL(raw,location.origin);
          u.searchParams.delete('_ts');
          const next=u.origin===location.origin?u.pathname+u.search:u.toString();
          if(typeof input==='string')input=next;
          else input=new Request(next,input);
        }
      }catch{}
      return nativeFetch(input,init);
    };
    window.__cgPhase3FetchFix=true;
  }

  const cls=active=>`shrink-0 px-4 py-2 rounded-lg border text-xs font-bold ${active?'bg-cyan-500 text-slate-950 border-cyan-400':'bg-slate-900 border-slate-700 text-slate-300'}`;
  function nav(active='analysis'){
    return `<div data-cg-phase3-nav="1" class="flex gap-2 overflow-x-auto pb-1 mb-4">
      <button data-cgfix="analysis" class="${cls(active==='analysis')}"><i class="fa-solid fa-chart-line mr-2"></i>Analisis Gap</button>
      <button data-cgfix="candidate" class="${cls(active==='candidate')}"><i class="fa-solid fa-filter-circle-dollar mr-2"></i>Candidate Issue</button>
      <button data-cgfix="assignment" class="${cls(active==='assignment')}"><i class="fa-solid fa-list-check mr-2"></i>Penugasan & Respons</button>
      <button data-cgfix="monitoring" class="${cls(active==='monitoring')}"><i class="fa-solid fa-satellite-dish mr-2"></i>Monitoring Respons</button>
    </div>`;
  }
  function bind(root){
    root?.querySelectorAll('[data-cgfix]').forEach(b=>b.onclick=()=>{
      const mode=b.dataset.cgfix;
      if(mode==='analysis') return window.openCommunicationGap?.();
      if(mode==='candidate') return window.openUnifiedCandidateIssues?.();
      if(mode==='assignment') return window.openCommunicationGapWorkspace?.('assignment');
      if(mode==='monitoring') return window.openCommunicationGapWorkspace?.('monitoring');
    });
  }
  function inject(){
    const cg=document.getElementById('commgap');
    if(!cg||cg.classList.contains('hidden'))return;
    cg.querySelectorAll('[data-cg-phase3-nav]').forEach((n,i)=>{if(i>0)n.remove()});
    let n=cg.querySelector('[data-cg-phase3-nav]');
    if(!n){n=document.createElement('div');n.innerHTML=nav('analysis');const actual=n.firstElementChild;cg.prepend(actual);n=actual;}
    bind(n);
  }
  const oldOpen=window.openCommunicationGap;
  if(typeof oldOpen==='function')window.openCommunicationGap=(...args)=>{const r=oldOpen(...args);setTimeout(inject,30);setTimeout(inject,150);return r};
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-communication-gap-tab]')){setTimeout(inject,50);setTimeout(inject,180)}});
  new MutationObserver(()=>inject()).observe(document.body,{childList:true,subtree:true});
  setTimeout(inject,100);
})();
