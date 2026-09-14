(()=>{
  const root=()=>document.getElementById('online');
  const apiBase=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  let running=false;

  async function api(path,opt={}){
    const headers={'content-type':'application/json',...(opt.headers||{})};
    const init={credentials:'include',...opt,headers};
    if(init.method&&String(init.method).toUpperCase()!=='GET'&&init.body===undefined)init.body='{}';
    const r=await fetch(apiBase()+path,init);
    const b=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);
    return b;
  }

  function buttonHost(){
    const section=root();if(!section)return null;
    const header=section.querySelector('.space-y-4 > .glass');
    const row=header?.querySelector('.flex.flex-wrap.items-start.justify-between');
    return row||header||null;
  }

  function ensureButton(){
    const host=buttonHost();
    if(!host||document.getElementById('onlineFetchLatest'))return;
    host.classList.add('flex','flex-wrap','gap-2');
    const btn=document.createElement('button');
    btn.id='onlineFetchLatest';
    btn.className='px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-black';
    btn.innerHTML='<i class="fa-solid fa-cloud-arrow-down mr-2"></i>Ambil Berita Terbaru';
    btn.addEventListener('click',runLatest);
    host.appendChild(btn);
  }

  function setState(text,icon='fa-cloud-arrow-down'){
    const btn=document.getElementById('onlineFetchLatest');
    if(!btn)return;
    btn.disabled=running;
    btn.innerHTML=`<i class="fa-solid ${icon} ${running?'fa-spin':''} mr-2"></i>${text}`;
  }

  function showResult(rows){
    const section=root();if(!section)return;
    section.querySelector('#onlineLatestResult')?.remove();
    const card=document.createElement('div');
    card.id='onlineLatestResult';
    card.className='glass rounded-2xl p-4 border border-emerald-500/20';
    const totalInserted=rows.reduce((n,r)=>n+Number(r.inserted||0),0);
    const totalFetched=rows.reduce((n,r)=>n+Number(r.fetched||0),0);
    card.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm"><i class="fa-solid fa-cloud-arrow-down text-emerald-300 mr-2"></i>Pengambilan Berita Terbaru</b><span class="text-[11px] text-slate-400">Ditemukan ${totalFetched} · Baru ${totalInserted}</span></div><div class="grid md:grid-cols-3 gap-3 mt-3">${rows.map(r=>`<div class="bg-slate-950/70 rounded-xl p-3 border ${r.error?'border-rose-500/30':'border-emerald-500/20'}"><div class="font-bold text-xs">${String(r.source||'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>${r.error?`<div class="text-[11px] text-rose-300 mt-2">${String(r.error).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>`:`<div class="text-[11px] text-slate-400 mt-2">Ditemukan <b class="text-white">${Number(r.fetched||0)}</b> · Duplikat <b class="text-white">${Number(r.duplicateSkipped||0)}</b> · Baru <b class="text-white">${Number(r.inserted||0)}</b> · Dianalisis <b class="text-white">${Number(r.analyzed||0)}</b>${Number(r.deferred||0)?` · Ditunda <b class="text-amber-300">${Number(r.deferred)}</b>`:''}</div>`}</div>`).join('')}</div>`;
    const header=section.querySelector('.space-y-4 > .glass');
    if(header?.parentElement)header.insertAdjacentElement('afterend',card);else section.prepend(card);
  }

  async function runLatest(){
    if(running)return;
    running=true;setState('Menyiapkan...','fa-spinner');
    const results=[];
    try{
      const health=await api('/ingestion/status');
      const sources=(health.sources||[]).filter(s=>String(s.category||'').toLowerCase()==='online'&&s.active!==false&&s.url);
      if(!sources.length)throw new Error('Tidak ada sumber media online aktif.');
      for(let i=0;i<sources.length;i++){
        const s=sources[i];setState(`Mengambil ${i+1}/${sources.length}: ${s.name}`,'fa-spinner');
        try{results.push(await api(`/online/sources/${encodeURIComponent(s.id)}/run`,{method:'POST',body:'{}'}));}
        catch(e){results.push({source:s.name,sourceId:String(s.id),error:e.message});}
      }
      showResult(results);
      const failed=results.filter(r=>r.error).length;
      const inserted=results.reduce((n,r)=>n+Number(r.inserted||0),0);
      window.toast?.(failed?`Selesai: ${inserted} berita baru, ${failed} sumber gagal.`:`Selesai: ${inserted} berita baru disimpan.`);
      document.getElementById('onlineRefresh')?.click();
    }catch(e){window.toast?.(`Gagal mengambil berita: ${e.message}`);}
    finally{running=false;setTimeout(()=>{ensureButton();setState('Ambil Berita Terbaru');},100);}
  }

  const obs=new MutationObserver(()=>ensureButton());
  const start=()=>{const el=root();if(el){obs.observe(el,{childList:true,subtree:true});ensureButton();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
