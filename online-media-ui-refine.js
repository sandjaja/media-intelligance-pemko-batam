(()=>{
  let refining=false,scheduled=false;
  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}
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
          [...table.querySelectorAll('tr')].forEach(row=>{
            const cells=[...row.children];
            [newIdx,foundIdx].filter(i=>i>=0).sort((a,b)=>b-a).forEach(i=>cells[i]?.remove());
          });
          const stored=[...table.querySelectorAll('thead th')].find(x=>String(x.textContent||'').trim().toLowerCase().includes('tersimpan 7 hari'));
          if(stored)setText(stored,'Berita 7 hari');
        }
      }
      const health=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Source Health')||String(x.textContent||'').includes('Kesehatan Sumber'));
      if(health){
        const heading=[...health.querySelectorAll('div')].find(x=>['Source Health','Kesehatan Sumber (Koneksi)','Kesehatan Sumber'].includes(String(x.textContent||'').trim()));
        if(heading&&String(heading.textContent||'').trim()!=='Kesehatan Sumber')heading.innerHTML='<i class="fa-solid fa-satellite-dish text-cyan-400 mr-2"></i>Kesehatan Sumber';
        if(!health.querySelector('[data-health-help]')){
          const help=document.createElement('div');help.dataset.healthHelp='1';help.className='text-[11px] text-slate-500 px-5 pb-4';
          help.innerHTML='Status sumber dipakai sebagai diagnostik. Proses utama adalah <b class="text-emerald-300">Ambil Berita Terbaru</b>, termasuk fallback collector bila akses langsung sumber bermasalah.';
          health.appendChild(help);
        }
      }
      const oldPanel=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Hasil Uji Koneksi Terakhir')||String(x.textContent||'').includes('Hasil Uji Terakhir'));
      if(oldPanel)oldPanel.remove();
    }finally{refining=false;}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refine();});}
  function loadLatest(){if(document.querySelector('script[data-online-latest-news]'))return;const s=document.createElement('script');s.src='./online-latest-news.js?v=20260914-latest3';s.dataset.onlineLatestNews='1';document.head.appendChild(s);}
  const obs=new MutationObserver(schedule);
  const start=()=>{const root=document.getElementById('online');if(root){obs.observe(root,{childList:true,subtree:true});refine();}loadLatest();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(()=>{refine();loadLatest();},100)});
})();
