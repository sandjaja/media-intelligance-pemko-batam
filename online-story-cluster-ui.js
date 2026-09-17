(()=>{
  const base=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('id-ID'):'-';
  let cache=null,loading=null,applying=false,retryTimer=null;
  async function load(){
    if(cache)return cache;if(loading)return loading;
    loading=fetch(base()+'/online/story-clusters?days=7&limit=300',{credentials:'include'}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);return b.data||[];}).then(rows=>{cache=rows;return rows;}).finally(()=>loading=null);return loading;
  }
  function invalidate(){cache=null;}
  function memberCard(m){return `<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-[10px] font-bold text-cyan-300">${esc(m.source_name||'-')}</span><span class="text-[10px] text-slate-500">${fmt(m.published_at)}</span></div><a href="${esc(m.url||'#')}" target="_blank" rel="noopener" class="block mt-1 text-xs text-slate-200 hover:text-cyan-300">${esc(m.title||'-')}</a><div class="text-[9px] text-slate-500 mt-1">#${esc(m.article_id)} · ${esc(m.similarity_type||'-')} · similarity ${Number(m.similarity_score||0).toFixed(2)}</div></div>`;}
  function decorate(article,cluster){
    if(!article||!cluster||Number(cluster.member_count)<=1)return;
    article.querySelector('.onlineStoryClusterBox')?.remove();
    const publications=Array.isArray(cluster.publications)?cluster.publications:[];
    const box=document.createElement('div');box.className='onlineStoryClusterBox mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3';box.dataset.clusterId=String(cluster.id||'');
    box.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap gap-2 text-[10px]"><span class="px-2 py-1 rounded bg-violet-500/15 text-violet-300 font-bold"><i class="fa-solid fa-layer-group mr-1"></i>${Number(cluster.source_count||0)} Media</span><span class="px-2 py-1 rounded bg-slate-800 text-slate-300">${Number(cluster.member_count||0)} Publikasi</span></div><button type="button" class="onlineStoryToggle text-[10px] font-semibold text-violet-300 hover:text-violet-200">Lihat ${Number(cluster.member_count||0)} Publikasi <i class="fa-solid fa-chevron-down ml-1"></i></button></div><div class="onlineStoryMembers hidden mt-3 space-y-2">${publications.map(memberCard).join('')}</div>`;
    box.querySelector('.onlineStoryToggle')?.addEventListener('click',()=>{const members=box.querySelector('.onlineStoryMembers'),btn=box.querySelector('.onlineStoryToggle');const open=members?.classList.contains('hidden');members?.classList.toggle('hidden',!open);if(btn)btn.innerHTML=`${open?'Tutup':'Lihat '+Number(cluster.member_count||0)+' Publikasi'} <i class="fa-solid fa-chevron-${open?'up':'down'} ml-1"></i>`;});article.appendChild(box);
  }
  function reset(root){
    root.querySelectorAll('article[data-story-cluster-hidden="1"]').forEach(a=>{a.style.display='';delete a.dataset.storyClusterHidden;});
    root.querySelectorAll('article[data-story-cluster-representative="1"]').forEach(a=>{delete a.dataset.storyClusterRepresentative;delete a.dataset.storyClusterId;});
  }
  function scheduleRetry(ms=350){clearTimeout(retryTimer);retryTimer=setTimeout(()=>apply(),ms);}
  async function apply(){
    if(applying)return;applying=true;
    try{
      const root=document.getElementById('online');if(!root)return;let clusters;try{clusters=await load();}catch(e){console.warn('Story cluster UI:',e);return;}
      reset(root);
      const articles=new Map([...root.querySelectorAll('article[data-online-article-id]')].map(a=>[String(a.getAttribute('data-online-article-id')),a]));
      if(!articles.size){scheduleRetry(400);return;}
      for(const cluster of clusters){
        const pubs=Array.isArray(cluster.publications)?cluster.publications:[];if(Number(cluster.member_count)<=1||pubs.length<=1)continue;
        const present=pubs.map(p=>({p,a:articles.get(String(p.article_id))})).filter(x=>x.a);if(!present.length)continue;
        // A cluster may have only one member visible in the current page/filter. Still
        // decorate that card with the full cluster from the API. Prefer the canonical
        // representative when visible; otherwise use the newest visible publication.
        const representativeId=String(cluster.representative_article_id||'');
        const representative=present.find(x=>String(x.p.article_id)===representativeId)||present.slice().sort((x,y)=>new Date(y.p.published_at||0)-new Date(x.p.published_at||0))[0];
        decorate(representative.a,cluster);
        representative.a.dataset.storyClusterRepresentative='1';representative.a.dataset.storyClusterId=String(cluster.id||'');
        for(const item of present){if(item.a===representative.a)continue;item.a.dataset.storyClusterHidden='1';item.a.dataset.storyClusterId=String(cluster.id||'');item.a.style.display='none';}
      }
      // Diagnostic bar removed now that database clustering is verified. Remove an old
      // bar left by a previous render/deployment if it exists.
      root.querySelector('#onlineStoryClusterStatus')?.remove();
    }finally{applying=false;}
  }
  const obs=new MutationObserver(mutations=>{if(!mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('article[data-online-article-id]')||n.querySelector?.('article[data-online-article-id]')))))return;scheduleRetry(80);});
  function start(){
    const root=document.getElementById('online');if(!root)return;obs.observe(root,{childList:true,subtree:true});
    const original=window.renderOnlineMediaWorkspace;
    if(typeof original==='function'&&!original.__storyClusterWrapped){const wrapped=async(...args)=>{const result=await original(...args);scheduleRetry(30);return result;};wrapped.__storyClusterWrapped=true;window.renderOnlineMediaWorkspace=wrapped;}
    apply();
    document.addEventListener('click',e=>{if(e.target?.closest?.('#onlineRefresh,#onlineRebuildClusters')){invalidate();scheduleRetry(500);}});
    window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')scheduleRetry(100);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
