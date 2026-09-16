(()=>{
  const base=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>v?new Date(v).toLocaleString('id-ID'):'-';
  let cache=null,loading=null;
  async function load(){
    if(cache)return cache;
    if(loading)return loading;
    loading=fetch(base()+'/online/story-clusters?days=7&limit=1000',{credentials:'include'}).then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);return b.data||[];}).then(rows=>{cache=rows;return rows;}).finally(()=>loading=null);
    return loading;
  }
  function invalidate(){cache=null;}
  function memberCard(m){return `<div class="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-[10px] font-bold text-cyan-300">${esc(m.source_name||'-')}</span><span class="text-[10px] text-slate-500">${fmt(m.published_at)}</span></div><a href="${esc(m.url||'#')}" target="_blank" rel="noopener" class="block mt-1 text-xs text-slate-200 hover:text-cyan-300">${esc(m.title||'-')}</a><div class="text-[9px] text-slate-500 mt-1">#${esc(m.article_id)} · ${esc(m.similarity_type||'-')} · similarity ${Number(m.similarity_score||0).toFixed(2)}</div></div>`;}
  function decorate(article,cluster){
    if(!article||!cluster||Number(cluster.member_count)<=1)return;
    if(article.querySelector('.onlineStoryClusterBox'))return;
    const box=document.createElement('div');box.className='onlineStoryClusterBox mt-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3';
    box.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><div class="flex flex-wrap gap-2 text-[10px]"><span class="px-2 py-1 rounded bg-violet-500/15 text-violet-300 font-bold"><i class="fa-solid fa-layer-group mr-1"></i>${Number(cluster.source_count||0)} Media</span><span class="px-2 py-1 rounded bg-slate-800 text-slate-300">${Number(cluster.member_count||0)} Publikasi</span></div><button type="button" class="onlineStoryToggle text-[10px] text-violet-300 hover:text-violet-200">Lihat ${Number(cluster.member_count||0)} Publikasi <i class="fa-solid fa-chevron-down ml-1"></i></button></div><div class="onlineStoryMembers hidden mt-3 space-y-2">${(cluster.members||[]).map(memberCard).join('')}</div>`;
    box.querySelector('.onlineStoryToggle')?.addEventListener('click',()=>{const members=box.querySelector('.onlineStoryMembers'),btn=box.querySelector('.onlineStoryToggle');const open=members?.classList.contains('hidden');members?.classList.toggle('hidden',!open);if(btn)btn.innerHTML=`${open?'Tutup':'Lihat '+Number(cluster.member_count||0)+' Publikasi'} <i class="fa-solid fa-chevron-${open?'up':'down'} ml-1"></i>`;});
    article.appendChild(box);
  }
  async function apply(){
    const root=document.getElementById('online');if(!root)return;
    let clusters;try{clusters=await load();}catch{return;}
    const byArticle=new Map();for(const c of clusters)for(const m of(c.members||[]))byArticle.set(String(m.article_id),c);
    root.querySelectorAll('article[data-online-article-id]').forEach(article=>{const id=article.getAttribute('data-online-article-id');if(id)decorate(article,byArticle.get(String(id)));});
  }
  const obs=new MutationObserver(()=>{clearTimeout(window.__onlineStoryClusterTimer);window.__onlineStoryClusterTimer=setTimeout(apply,80);});
  function start(){const root=document.getElementById('online');if(!root)return;obs.observe(root,{childList:true,subtree:true});apply();document.addEventListener('click',e=>{if(e.target?.closest?.('#onlineRefresh,#onlineRebuildClusters')){invalidate();setTimeout(apply,500);}});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
