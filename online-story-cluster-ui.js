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
  function buildClusterBox(cluster){
    const publications=Array.isArray(cluster.publications)?cluster.publications:[];
    const box=document.createElement('section');
    box.className='onlineStoryClusterBox rounded-xl border border-violet-500/30 bg-violet-500/5 p-3';
    box.dataset.clusterId=String(cluster.id||'');
    const clusterTitle=cluster.canonical_title||cluster.story_title||cluster.title||publications[0]?.title||'Story Media Online';
    box.innerHTML=`<div class="mb-3"><div class="text-[9px] uppercase tracking-widest text-violet-400 font-black">Judul Kluster</div><div class="mt-1 text-sm font-bold text-slate-100">${esc(clusterTitle)}</div></div><div class="flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap gap-2 text-[10px]"><span class="px-2 py-1 rounded bg-violet-500/15 text-violet-300 font-bold"><i class="fa-solid fa-layer-group mr-1"></i>${Number(cluster.source_count||0)} Media</span><span class="px-2 py-1 rounded bg-slate-800 text-slate-300">${Number(cluster.member_count||0)} Publikasi</span></div><button type="button" class="onlineStoryToggle text-[10px] font-semibold text-violet-300 hover:text-violet-200">Lihat ${Number(cluster.member_count||0)} Publikasi <i class="fa-solid fa-chevron-down ml-1"></i></button></div><div class="onlineStoryMembers hidden mt-3 space-y-3"></div>`;
    box.querySelector('.onlineStoryToggle')?.addEventListener('click',()=>{
      const members=box.querySelector('.onlineStoryMembers'),btn=box.querySelector('.onlineStoryToggle');
      const open=members?.classList.contains('hidden');members?.classList.toggle('hidden',!open);
      if(btn)btn.innerHTML=`${open?'Tutup':'Lihat '+Number(cluster.member_count||0)+' Publikasi'} <i class="fa-solid fa-chevron-${open?'up':'down'} ml-1"></i>`;
    });
    return box;
  }
  function stripStoryChrome(article){
    article.querySelectorAll(':scope > [data-online-cluster-feed-chrome="1"]').forEach(x=>x.remove());
    const first=article.firstElementChild;
    if(first?.textContent?.trim().startsWith('STORY ·')){first.dataset.onlineClusterFeedChrome='1';first.style.display='none';}
    article.classList.add('rounded-xl','border','border-slate-800','bg-slate-950/60','p-3');
  }
  function reset(root){
    // Restore the real article nodes to their exact feed positions. No clones are used.
    root.querySelectorAll('.onlineStoryClusterBox').forEach(box=>{
      const members=box.querySelector('.onlineStoryMembers');
      [...(members?.querySelectorAll(':scope > article[data-online-article-id]')||[])].forEach(article=>{
        const id=String(article.getAttribute('data-online-article-id')||'');
        const marker=root.querySelector(`template[data-online-cluster-placeholder="${CSS.escape(id)}"]`);
        article.querySelectorAll(':scope > [data-online-cluster-feed-chrome="1"]').forEach(x=>{x.style.display='';delete x.dataset.onlineClusterFeedChrome;});
        article.classList.remove('rounded-xl','border','border-slate-800','bg-slate-950/60','p-3');
        delete article.dataset.storyClusterId;
        if(marker){marker.replaceWith(article);}else root.appendChild(article);
      });
      box.remove();
    });
    root.querySelectorAll('template[data-online-cluster-placeholder]').forEach(x=>x.remove());
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
        const representativeId=String(cluster.representative_article_id||'');
        const anchor=present.find(x=>String(x.p.article_id)===representativeId)||present.slice().sort((x,y)=>new Date(y.p.published_at||0)-new Date(x.p.published_at||0))[0];
        const box=buildClusterBox(cluster);
        anchor.a.before(box);
        const members=box.querySelector('.onlineStoryMembers');
        // Move the ORIGINAL feed cards into the cluster. This keeps one renderer, one DOM
        // node and the original approval/correction event handlers for every publication.
        for(const item of present){
          const article=item.a,id=String(item.p.article_id);
          const marker=document.createElement('template');marker.dataset.onlineClusterPlaceholder=id;
          article.before(marker);
          stripStoryChrome(article);
          article.dataset.storyClusterId=String(cluster.id||'');
          members.appendChild(article);
        }
      }
      // Diagnostic bar removed now that database clustering is verified. Remove an old
      // bar left by a previous render/deployment if it exists.
      root.querySelector('#onlineStoryClusterStatus')?.remove();
    }finally{applying=false;}
  }
  const obs=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&n.classList?.contains('onlineStoryClusterBox'))))return;if(!mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('article[data-online-article-id]:not(.onlineStoryMembers article)')||n.querySelector?.('article[data-online-article-id]:not(.onlineStoryMembers article)')))))return;scheduleRetry(80);});
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
