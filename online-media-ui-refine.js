(()=>{
  let refining=false,scheduled=false;
  const selected=new Set();
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}
  function articleId(article){const el=article.querySelector('[data-correct-id],[data-approve-id],[data-support-id],[data-irrel-id]');return el?.dataset.correctId||el?.dataset.approveId||el?.dataset.supportId||el?.dataset.irrelId||null;}
  function syncSelectedButton(root){const btn=root.querySelector('#onlineReanalyzeSelected');if(!btn)return;btn.textContent=selected.size?`Analisa Ulang Terpilih (${selected.size})`:'Analisa Ulang Terpilih';btn.disabled=selected.size===0;}
  async function reanalyzeSelected(root){const ids=[...selected].map(Number).filter(Number.isInteger);if(!ids.length)return;const btn=root.querySelector('#onlineReanalyzeSelected');if(btn){btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin mr-1"></i>Menganalisis...';}try{const r=await fetch((window.MEDIA_INTELLIGENCE_API||'/api')+'/online/reanalyze',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({articleIds:ids})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);selected.clear();window.toast?.(`Analisa ulang selesai: ${b.analyzed||0} berhasil${b.failed?`, ${b.failed} gagal`:''}.`);window.renderOnlineMediaWorkspace?.();}catch(e){window.toast?.(`Analisa ulang gagal: ${e.message}`);syncSelectedButton(root);}}
  function installSelection(root){
    const feed=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Feed Berita'));
    if(feed&&!feed.querySelector('#onlineReanalyzeSelected')){
      const heading=[...feed.querySelectorAll('h3')].find(x=>String(x.textContent||'').includes('Feed Berita'));
      const bar=heading?.parentElement;
      if(bar){const btn=document.createElement('button');btn.id='onlineReanalyzeSelected';btn.className='px-3 py-2 rounded-lg bg-violet-700 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold';btn.disabled=true;btn.textContent='Analisa Ulang Terpilih';btn.addEventListener('click',()=>reanalyzeSelected(root));bar.appendChild(btn);}
    }
    root.querySelectorAll('article').forEach(article=>{
      if(article.querySelector('[data-online-select]'))return;const id=articleId(article);if(!id)return;
      const label=document.createElement('label');label.dataset.onlineSelect='1';label.className='float-right ml-3 flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer';
      const cb=document.createElement('input');cb.type='checkbox';cb.className='accent-violet-500';cb.checked=selected.has(String(id));cb.addEventListener('change',()=>{if(cb.checked)selected.add(String(id));else selected.delete(String(id));syncSelectedButton(root);});
      label.append(cb,document.createTextNode('Pilih'));article.prepend(label);
    });
    syncSelectedButton(root);
  }
  function refine(){
    if(refining)return;refining=true;
    try{
      const root=document.getElementById('online');if(!root)return;
      root.querySelector('#onlineRunTest')?.remove();
      for(const el of root.querySelectorAll('div')){
        const txt=String(el.textContent||'').trim();
        if(txt==='TOTAL AKTIF')setText(el,'BERITA AKTIF 7 HARI');
        if(txt==='TOTAL TIDAK RELEVAN')setText(el,'BERITA TIDAK RELEVAN 7 HARI');
      }
      for(const table of root.querySelectorAll('table')){
        const heads=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());
        const foundIdx=heads.findIndex(x=>x.includes('ditemukan terakhir'));
        const newIdx=heads.findIndex(x=>x.includes('baru terakhir'));
        if(foundIdx>=0||newIdx>=0){
          [...table.querySelectorAll('tr')].forEach(row=>{const cells=[...row.children];[newIdx,foundIdx].filter(i=>i>=0).sort((a,b)=>b-a).forEach(i=>cells[i]?.remove());});
          const stored=[...table.querySelectorAll('thead th')].find(x=>String(x.textContent||'').trim().toLowerCase().includes('tersimpan 7 hari'));if(stored)setText(stored,'Berita 7 hari');
        }
      }
      const health=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Source Health')||String(x.textContent||'').includes('Kesehatan Sumber'));
      if(health){const heading=[...health.querySelectorAll('div')].find(x=>['Source Health','Kesehatan Sumber (Koneksi)','Kesehatan Sumber'].includes(String(x.textContent||'').trim()));if(heading&&String(heading.textContent||'').trim()!=='Kesehatan Sumber')heading.innerHTML='<i class="fa-solid fa-satellite-dish text-cyan-400 mr-2"></i>Kesehatan Sumber';if(!health.querySelector('[data-health-help]')){const help=document.createElement('div');help.dataset.healthHelp='1';help.className='text-[11px] text-slate-500 px-5 pb-4';help.innerHTML='Status sumber dipakai sebagai diagnostik. Proses utama adalah <b class="text-emerald-300">Ambil Berita Terbaru</b>, termasuk fallback collector bila akses langsung sumber bermasalah.';health.appendChild(help);}}
      const oldPanel=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Hasil Uji Koneksi Terakhir')||String(x.textContent||'').includes('Hasil Uji Terakhir'));if(oldPanel)oldPanel.remove();
      installSelection(root);
    }finally{refining=false;}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refine();});}
  function loadLatest(){if(document.querySelector('script[data-online-latest-news]'))return;const s=document.createElement('script');s.src='./online-latest-news.js?v=20260914-reanalysis1';s.dataset.onlineLatestNews='1';document.head.appendChild(s);}
  const obs=new MutationObserver(schedule);
  const start=()=>{const root=document.getElementById('online');if(root){obs.observe(root,{childList:true,subtree:true});refine();}loadLatest();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(()=>{refine();loadLatest();},100)});
})();
