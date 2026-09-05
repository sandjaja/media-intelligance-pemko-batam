(()=>{
  const safeToast=(msg)=>{
    const t=document.getElementById('toast');
    if(!t)return;
    t.textContent=String(msg??'');
    t.classList.remove('hidden');
    clearTimeout(window.__toast);
    window.__toast=setTimeout(()=>t.classList.add('hidden'),3500);
  };
  window.toast=window.toast||safeToast;

  const originalShowTab=window.showTab;
  if(typeof originalShowTab==='function'){
    window.showTab=(id)=>{
      if(id==='reports'){
        document.querySelectorAll('main section').forEach(s=>s.classList.add('hidden'));
        document.getElementById('reports')?.classList.remove('hidden');
        document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
        window.renderDailyReport?.();
        return;
      }
      return originalShowTab(id);
    };
  }

  window.addEventListener('error',(event)=>{
    if(String(event?.message||'').includes('toast')) safeToast('Terjadi error pada notifikasi UI.');
  });
})();
