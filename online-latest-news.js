(()=>{
  const root=()=>document.getElementById('online');
  const apiBase=()=>window.MEDIA_INTELLIGENCE_API||'/api';
  let running=false,reanalyzing=false;

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
    const host=buttonHost();if(!host)return;
    host.classList.add('flex','flex-wrap','gap-2');
    if(!document.getElementById('onlineFetchLatest')){
      const btn=document.createElement('button');btn.id='onlineFetchLatest';
      btn.className='px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-black';
      btn.innerHTML='<i class="fa-solid fa-cloud-arrow-down mr-2"></i>Ambil Berita Terbaru';btn.addEventListener('click',runLatest);host.appendChild(btn);
    }
    if(!document.getElementById('onlineReanalyze7d')){
      const btn=document.createElement('button');btn.id='onlineReanalyze7d';
      btn.className='px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-xs font-black';
      btn.title='Analisis ulang berita online 7 hari terakhir dengan engine klasifikasi terbaru';
      btn.innerHTML='<i class="fa-solid fa-arrows-rotate mr-2"></i>Analisis Ulang 7 Hari';btn.addEventListener('click',runReanalysis);host.appendChild(btn);
    }
  }

  function setState(text,icon='fa-cloud-arrow-down'){
    const btn=document.getElementById('onlineFetchLatest');if(!btn)return;btn.disabled=running||reanalyzing;
    btn.innerHTML=`<i class="fa-solid ${icon} ${running?'fa-spin':''} mr-2"></i>${text}`;
  }
  function setReanalysisState(text,spin=false){
    const btn=document.getElementById('onlineReanalyze7d');if(!btn)return;btn.disabled=running||reanalyzing;
    btn.innerHTML=`<i class="fa-solid fa-arrows-rotate ${spin?'fa-spin':''} mr-2"></i>${text}`;
  }
  function syncButtons(){
    const fetchBtn=document.getElementById('onlineFetchLatest');const reBtn=document.getElementById('onlineReanalyze7d');
    if(fetchBtn)fetchBtn.disabled=running||reanalyzing;if(reBtn)reBtn.disabled=running||reanalyzing;
  }

  function showResult(rows){
    const section=root();if(!section)return;section.querySelector('#onlineLatestResult')?.remove();
    const card=document.createElement('div');card.id='onlineLatestResult';card.className='glass rounded-2xl p-4 border border-emerald-500/20';
    const totalInserted=rows.reduce((n,r)=>n+Number(r.inserted||0),0),totalFetched=rows.reduce((n,r)=>n+Number(r.fetched||0),0);
    card.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm"><i class="fa-solid fa-cloud-arrow-down text-emerald-300 mr-2"></i>Pengambilan Berita Terbaru</b><span class="text-[11px] text-slate-400">Ditemukan ${totalFetched} · Baru ${totalInserted}</span></div><div class="grid md:grid-cols-3 gap-3 mt-3">${rows.map(r=>`<div class="bg-slate-950/70 rounded-xl p-3 border ${r.error?'border-rose-500/30':'border-emerald-500/20'}"><div class="font-bold text-xs">${String(r.source||'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>${r.error?`<div class="text-[11px] text-rose-300 mt-2">${String(r.error).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div>`:`<div class="text-[11px] text-slate-400 mt-2">Ditemukan <b class="text-white">${Number(r.fetched||0)}</b> · Duplikat <b class="text-white">${Number(r.duplicateSkipped||0)}</b> · Baru <b class="text-white">${Number(r.inserted||0)}</b> · Dianalisis <b class="text-white">${Number(r.analyzed||0)}</b>${Number(r.deferred||0)?` · Ditunda <b class="text-amber-300">${Number(r.deferred)}</b>`:''}</div>`}</div>`).join('')}</div>`;
    const header=section.querySelector('.space-y-4 > .glass');if(header?.parentElement)header.insertAdjacentElement('afterend',card);else section.prepend(card);
  }

  function showReanalysisResult(result){
    const section=root();if(!section)return;section.querySelector('#onlineReanalysisResult')?.remove();
    const card=document.createElement('div');card.id='onlineReanalysisResult';card.className='glass rounded-2xl p-4 border border-cyan-500/20';
    card.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><b class="text-sm"><i class="fa-solid fa-arrows-rotate text-cyan-300 mr-2"></i>Analisis Ulang 7 Hari</b><span class="text-[11px] text-slate-400">Diproses ${Number(result.requested||0)} artikel</span></div><div class="text-xs text-slate-300 mt-3">Berhasil dianalisis <b class="text-emerald-300">${Number(result.analyzed||0)}</b> · Gagal <b class="${Number(result.failed||0)?'text-rose-300':'text-white'}">${Number(result.failed||0)}</b></div>`;
    const header=section.querySelector('.space-y-4 > .glass');if(header?.parentElement)header.insertAdjacentElement('afterend',card);else section.prepend(card);
  }

  async function runReanalysis(){
    if(running||reanalyzing)return;reanalyzing=true;syncButtons();setReanalysisState('Menganalisis 7 hari...',true);
    try{
      const result=await api('/online/reanalyze',{method:'POST',body:JSON.stringify({days:7,limit:300})});
      showReanalysisResult(result);window.toast?.(`Analisis ulang selesai: ${Number(result.analyzed||0)} berhasil, ${Number(result.failed||0)} gagal.`);document.getElementById('onlineRefresh')?.click();
    }catch(e){window.toast?.(`Gagal analisis ulang: ${e.message}`);}
    finally{reanalyzing=false;ensureButton();setReanalysisState('Analisis Ulang 7 Hari');setState('Ambil Berita Terbaru');syncButtons();}
  }

  async function runLatest(){
    if(running||reanalyzing)return;running=true;syncButtons();setState('Menyiapkan...','fa-spinner');const results=[];
    try{
      const health=await api('/ingestion/status');const sources=(health.sources||[]).filter(s=>String(s.category||'').toLowerCase()==='online'&&s.active!==false&&s.url);if(!sources.length)throw new Error('Tidak ada sumber media online aktif.');
      for(let i=0;i<sources.length;i++){const s=sources[i];setState(`Mengambil ${i+1}/${sources.length}: ${s.name}`,'fa-spinner');try{results.push(await api(`/online/sources/${encodeURIComponent(s.id)}/run`,{method:'POST',body:'{}'}));}catch(e){results.push({source:s.name,sourceId:String(s.id),error:e.message});}}
      showResult(results);const failed=results.filter(r=>r.error).length,inserted=results.reduce((n,r)=>n+Number(r.inserted||0),0);window.toast?.(failed?`Selesai: ${inserted} berita baru, ${failed} sumber gagal.`:`Selesai: ${inserted} berita baru disimpan.`);document.getElementById('onlineRefresh')?.click();
    }catch(e){window.toast?.(`Gagal mengambil berita: ${e.message}`);}
    finally{running=false;ensureButton();setState('Ambil Berita Terbaru');setReanalysisState('Analisis Ulang 7 Hari');syncButtons();}
  }

  const obs=new MutationObserver(()=>ensureButton());const start=()=>{const el=root();if(el){obs.observe(el,{childList:true,subtree:true});ensureButton();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
