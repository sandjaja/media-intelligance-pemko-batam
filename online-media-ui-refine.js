(()=>{
  function refine(){
    const root=document.getElementById('online');if(!root)return;
    const tables=[...root.querySelectorAll('table')];
    for(const table of tables){
      const heads=[...table.querySelectorAll('thead th')].map(x=>String(x.textContent||'').trim().toLowerCase());
      const foundIdx=heads.findIndex(x=>x.includes('ditemukan terakhir'));
      const newIdx=heads.findIndex(x=>x.includes('baru terakhir'));
      if(foundIdx>=0||newIdx>=0){
        [...table.querySelectorAll('tr')].forEach(row=>{
          const cells=[...row.children];
          [newIdx,foundIdx].filter(i=>i>=0).sort((a,b)=>b-a).forEach(i=>cells[i]?.remove());
        });
        const stored=[...table.querySelectorAll('thead th')].find(x=>String(x.textContent||'').trim().toLowerCase().includes('tersimpan 7 hari'));
        if(stored)stored.textContent='Berita 7 hari';
      }
    }
    const panel=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Hasil Uji Terakhir'));
    if(panel){
      [...panel.querySelectorAll('.text-[11px]')].forEach(el=>{
        const txt=String(el.textContent||'');
        if(!txt.includes('INTERNAL_SERVER_ERROR')&&txt.includes('Ditemukan')&&txt.includes('Dianalisis')){
          const nums=txt.match(/\d+/g)||[];
          const found=Number(nums[0]||0);
          el.textContent=found>0?`Sumber dapat diakses · ${found} artikel terdeteksi pada uji terakhir`:'Sumber dapat diakses';
        }
      });
    }
  }
  function loadLatestNewsButton(){
    if(document.querySelector('script[data-online-latest-news]'))return;
    const s=document.createElement('script');
    s.src='./online-latest-news.js?v=20260914-latest1';
    s.dataset.onlineLatestNews='1';
    document.head.appendChild(s);
  }
  const obs=new MutationObserver(()=>refine());
  const start=()=>{const root=document.getElementById('online');if(root){obs.observe(root,{childList:true,subtree:true});refine();}loadLatestNewsButton();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(()=>{refine();loadLatestNewsButton();},100)});
})();
