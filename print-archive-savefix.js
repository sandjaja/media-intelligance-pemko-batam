(()=>{
  const normalizeStatus=(value)=>{
    const v=String(value||'').trim().toLowerCase().replace(/\s+/g,'_');
    return ['needs_review','verified','analyzed','uploaded','ocr_processing','failed'].includes(v)?v:null;
  };
  function ensureStatusField(){
    const form=document.getElementById('paEdit');
    if(!form||document.getElementById('peStatus'))return;
    const statusLabel=[...form.querySelectorAll('label')].find(label=>{
      const first=label.querySelector('span');
      return first&&String(first.textContent||'').trim().toLowerCase()==='status';
    });
    const visible=statusLabel?.querySelector('div')?.textContent||'';
    const status=normalizeStatus(visible);
    if(!status)return;
    const hidden=document.createElement('input');
    hidden.type='hidden';
    hidden.id='peStatus';
    hidden.value=status;
    hidden.dataset.workflowStatus='true';
    form.appendChild(hidden);
  }
  const observer=new MutationObserver(ensureStatusField);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',ev=>{
    if(ev.target.closest?.('[data-view]')){
      setTimeout(ensureStatusField,50);
      setTimeout(ensureStatusField,250);
      setTimeout(ensureStatusField,700);
    }
  },true);
  ensureStatusField();
})();
