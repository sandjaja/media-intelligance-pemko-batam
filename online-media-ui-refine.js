(()=>{
  let refining=false;
  let scheduled=false;

  function setHtmlIfChanged(el,html){
    if(el&&el.innerHTML!==html)el.innerHTML=html;
  }
  function setTextIfChanged(el,text){
    if(el&&el.textContent!==text)el.textContent=text;
  }

  function refine(){
    if(refining)return;
    refining=true;
    try{
      const root=document.getElementById('online');if(!root)return;

      const testBtn=root.querySelector('#onlineRunTest');
      if(testBtn){
        const label=testBtn.disabled?'Sedang Menguji Koneksi...':'Uji Koneksi Sumber';
        const iconClass=testBtn.disabled?'fa-spinner fa-spin':'fa-plug';
        setHtmlIfChanged(testBtn,`<i class="fa-solid ${iconClass} mr-2"></i>${label}`);
        const title='Memeriksa apakah URL sumber media dapat diakses. Uji ini tidak mengambil atau menganalisis berita.';
        if(testBtn.title!==title)testBtn.title=title;
      }

      for(const el of root.querySelectorAll('div')){
        const txt=String(el.textContent||'').trim();
        if(txt==='TOTAL AKTIF')setTextIfChanged(el,'BERITA AKTIF 7 HARI');
        if(txt==='TOTAL TIDAK RELEVAN')setTextIfChanged(el,'BERITA TIDAK RELEVAN 7 HARI');
      }

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
          if(stored)setTextIfChanged(stored,'Berita 7 hari');
        }
      }

      const sourceHealth=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Source Health')||String(x.textContent||'').includes('Kesehatan Sumber (Koneksi)'));
      if(sourceHealth){
        const heading=[...sourceHealth.querySelectorAll('div')].find(x=>['Source Health','Kesehatan Sumber (Koneksi)'].includes(String(x.textContent||'').trim()));
        if(heading)setHtmlIfChanged(heading,'<i class="fa-solid fa-satellite-dish text-cyan-400 mr-2"></i>Kesehatan Sumber (Koneksi)');
      }

      const panel=[...root.querySelectorAll('.glass')].find(x=>String(x.textContent||'').includes('Hasil Uji Terakhir')||String(x.textContent||'').includes('Hasil Uji Koneksi Terakhir'));
      if(panel){
        const title=[...panel.querySelectorAll('b')].find(x=>/Hasil Uji(?: Koneksi)? Terakhir/.test(String(x.textContent||'')));
        if(title)setHtmlIfChanged(title,'<i class="fa-solid fa-plug text-cyan-300 mr-2"></i>Hasil Uji Koneksi Terakhir');
        [...panel.querySelectorAll('.text-[11px]')].forEach(el=>{
          const txt=String(el.textContent||'');
          if(!/HTTP\s+\d+|ERROR|FAILED/i.test(txt)&&txt.includes('Ditemukan')&&txt.includes('Dianalisis'))setTextIfChanged(el,'Sumber dapat diakses');
        });
        if(!panel.querySelector('[data-source-health-note]')){
          const note=document.createElement('div');
          note.dataset.sourceHealthNote='1';
          note.className='text-[11px] text-slate-500 mt-3 border-t border-slate-800 pt-3';
          note.innerHTML='<i class="fa-solid fa-circle-info mr-1 text-cyan-400"></i>Uji koneksi hanya memeriksa akses ke URL sumber. Uji ini tidak mengambil berita. Gunakan <b class="text-emerald-300">Ambil Berita Terbaru</b> untuk menjalankan collector, filter wilayah, routing OPD, dan analisis.';
          panel.appendChild(note);
        }
      }
    } finally {
      refining=false;
    }
  }

  function scheduleRefine(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refine();});
  }

  function loadLatestNewsButton(){
    if(document.querySelector('script[data-online-latest-news]'))return;
    const s=document.createElement('script');
    s.src='./online-latest-news.js?v=20260914-latest2';
    s.dataset.onlineLatestNews='1';
    document.head.appendChild(s);
  }

  const obs=new MutationObserver(scheduleRefine);
  const start=()=>{
    const root=document.getElementById('online');
    if(root){obs.observe(root,{childList:true,subtree:true});refine();}
    loadLatestNewsButton();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('media-intelligence-tab',e=>{if(e.detail==='online')setTimeout(()=>{refine();loadLatestNewsButton();},100)});
})();
