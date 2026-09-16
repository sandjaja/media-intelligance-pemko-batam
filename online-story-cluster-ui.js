(()=>{
  const base=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('id-ID'):'-';
  let cache=null,loading=null,applying=false;
  function status(text,tone='slate'){
    const root=document.getElementById('online');if(!root)return;
    let el=root.querySelector('#onlineStoryClusterStatus');
    if(!el){el=document.createElement('div');el.id='onlineStoryClusterStatus';el.className='mx-0 mb-3 rounded-lg border px-3 py-2 text-[10px]';root.prepend(el);}
    const cls=tone==='ok'?'border-emerald-500/30 bg-emerald-500/5 text-emerald-300':tone==='error'?'border-rose-500/30 bg-rose-500/5 text-rose-300':'border-slate-700 bg-slate-900/60 text-slate-400';
    el.className='mx-0 mb-3 rounded-lg border px-3 py-2 text-[10px] '+cls;el.textContent=text;
  }
  async function load(){
    if(cache)return cache;if(loading)return loading;
    status('Story Cluster: memuat data…');
    loading=fetch(base()+'/online/story-clusters?days=7&limit=300',{credentials:'include'}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error((b.message||b.error||`HTTP ${r.status}`));return b.data||[];}).then(rows=>{cache=rows;return rows;}).finally(()=>loading=null);return loading;
  }
  function invalidate(){cache=null;}
  function memberCard(m){return `<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-[10px] font-bold text-cyan-300">${esc(m.source_name||'-')}</span><span class="text-[10px] text-slate-500">${fmt(m.published_at)}</span></div><a href="${esc(m.url||'#')}" target="_blank" rel="noopener" class="block mt-1 text-xs text-slate-200 hover:text-cyan-300">${esc(m.title||'-')}</a><div class="text-[9px] text-slate-500 mt-1">#${esc(m.article_id)} · ${esc(m.similarity_type||'-')} · similarity ${Number(m.similarity_score||0).toFixed(2)}</div></div>`;}
  function decorate(article,cluster){
    if(!article||!cluster||Number(cluster.member_count)<=1)return;
    let box=article.querySelector('.onlineStoryClusterBox');if(box)return;
    const publications=Array.isArray(cluster.publications)?cluster.publications:[];
    box=document.createElement('div');box.className='onlineStoryClusterBox mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3';box.dataset.clusterId=String(cluster.id||'');
    box.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap gap-2 text-[10px]"><span class="px-2 py-1 rounded bg-violet-500/15 text-violet-300 font-bold"><i class="fa-solid fa-layer-group mr-1"></i>${Number(cluster.source_count||0)} Media</span><span class="px-2 py-1 rounded bg-slate-800 text-slate-300">${Number(cluster.member_count||0)} Publikasi</span></div><button type="button" class="onlineStoryToggle text-[10px] font-semibold text-violet-300 hover:text-violet-200">Lihat ${Number(cluster.member_count||0)} Publikasi <i class="fa-solid fa-chevron-down ml-1"></i></button></div><div class="onlineStoryMembers hidden mt-3 space-y-2">${publications.map(memberCard).join('')}</div>`;
    box.querySelector('.onlineStoryToggle')?.addEventListener('click',()=>{const members=box.querySelector('.onlineStoryMembers'),btn=box.querySelector('.onlineStoryToggle');const open=members?.classList.contains('hidden');members?.classList.toggle('hidden',!open);if(btn)btn.innerHTML=`${open?'Tutup':'Lihat '+Number(cluster.member_count||0)+' Publikasi'} <i class="fa-solid fa-chevron-${open?'up':'down'} ml-1"></i>`;});article.appendChild(box);
  }
  function reset(root){root.querySelectorAll('article[data-story-cluster-hidden="1"]').forEach(a=>{a.style.display='';delete a.dataset.storyClusterHidden;});}
  async function apply(){
    if(applying)return;applying=true;
    try{
      const root=document.getElementById('online');if(!root)return;let clusters;try{clusters=await load();}catch(e){console.warn('Story cluster UI:',e);status('Story Cluster ERROR: '+String(e?.message||e),'error');return;}
      reset(root);
      const articles=new Map([...root.querySelectorAll('article[data-online-article-id]')].map(a=>[String(a.getAttribute('data-online-article-id')),a]));
      const multi=clusters.filter(c=>Number(c.member_count)>1);let matchedClusters=0,matchedArticles=0;
      for(const cluster of clusters){
        const pubs=Array.isArray(cluster.publications)?cluster.publications:[];if(Number(cluster.member_count)<=1||pubs.length<=1)continue;
        const present=pubs.map(p=>({p,a:articles.get(String(p.article_id))})).filter(x=>x.a);if(present.length<=1)continue;
        matchedClusters++;matchedArticles+=present.length;
        const representativeId=String(cluster.representative_article_id||'');const representative=present.find(x=>String(x.p.article_id)===representativeId)||present[0];
        decorate(representative.a,cluster);
        representative.a.dataset.storyClusterRepresentative='1';representative.a.dataset.storyClusterId=String(cluster.id||'');
        for(const item of present){if(item.a===representative.a)continue;item.a.dataset.storyClusterHidden='1';item.a.dataset.storyClusterId=String(cluster.id||'');item.a.style.display='none';}
      }
      status(`Story Cluster: ${clusters.length} cluster · ${multi.length} multi-publikasi · ${matchedClusters} cocok di feed · ${articles.size} artikel UI`,matchedClusters?'ok':'slate');
    }finally{applying=false;}
  }
  const obs=new MutationObserver(()=>{clearTimeout(window.__onlineStoryClusterTimer);window.__onlineStoryClusterTimer=setTimeout(apply,120);});
  function start(){const root=document.getElementById('online');if(!root)return;obs.observe(root,{childList:true,subtree:true});apply();document.addEventListener('click',e=>{if(e.target?.closest?.('#onlineRefresh,#onlineRebuildClusters')){invalidate();setTimeout(apply,500);}});window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(apply,150);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
