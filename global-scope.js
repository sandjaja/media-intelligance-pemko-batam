(()=>{
 const districtSelect=document.getElementById('districtSelect'),opdSelect=document.getElementById('opdSelect'),opdGroupSelect=document.getElementById('opdGroupSelect');
 if(!districtSelect||!opdSelect||typeof api!=='function'||typeof state==='undefined')return;
 const branding=()=>window.getMediaBranding?.()||window.MEDIA_BRANDING||{};
 const governmentShort=()=>branding().short_name||branding().government_name||'Pemerintah Daerah';
 const cityName=()=>branding().city_name||'';
 state.district=state.district||'all';state.districtList=state.districtList||[];
 let masterOptionsPromise=null;
 async function loadMasterOptions(){
  if(state.opdList?.length&&state.districtList?.length)return {opd:state.opdList,districts:state.districtList};
  if(!masterOptionsPromise)masterOptionsPromise=Promise.all([api('/opd'),api('/districts')]).then(([o,d])=>({opd:o.data||[],districts:d.data||[]})).catch(err=>{masterOptionsPromise=null;throw err});
  return masterOptionsPromise;
 }
 function renderOpdOptions(){const g=opdGroupSelect?.value||'all';if(g==='all'){state.opd='all';opdSelect.disabled=true;opdSelect.innerHTML='<option value="all">— Pilih jenis unit dahulu —</option>';return}const rows=(state.opdList||[]).filter(x=>x.active!==false&&String(x.opd_group||'LAINNYA')===g);opdSelect.disabled=false;opdSelect.innerHTML='<option value="all">Semua '+esc(({DINAS:'Dinas',BADAN:'Badan',SETDA:'Bagian / Setda',LAINNYA:'Unit lainnya'}[g]||'OPD'))+'</option>'+rows.map(x=>`<option value="${esc(x.id)}">${esc(x.code||'-')} — ${esc(x.name)}</option>`).join('');if(state.opd!=='all'&&!rows.some(x=>String(x.id)===String(state.opd)))state.opd='all';opdSelect.value=state.opd}async function options(){if(window.MEDIA_BRANDING_READY)await window.MEDIA_BRANDING_READY.catch(()=>null);const master=await loadMasterOptions();state.opdList=master.opd;state.districtList=master.districts;renderOpdOptions();districtSelect.innerHTML=`<option value="all">${cityName()?`Semua Kecamatan / ${esc(cityName())}`:'Semua Kecamatan'}</option>`+state.districtList.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');districtSelect.value=state.district}
 async function refresh(){
  if(state.tab==='printarchive'){
   try{await window.renderPrintArchive?.();setTimeout(()=>window.applyPrintArchiveGlobalScope?.(),80);return}catch(err){console.warn('Print archive scope refresh failed',err);window.toast?.('Filter Arsip Media Cetak gagal dimuat: '+err.message);return}
  }
  if(state.tab==='dashboard')return;
  const q=new URLSearchParams();if(state.opd!=='all')q.set('opdId',String(state.opd));if(state.district!=='all')q.set('districtId',String(state.district));
  try{const r=await api('/command-center/scope'+(q.toString()?`?${q}`:''));state.metrics=r.metrics||{};state.articles=r.articles||[];state.highlights=r.highlights||[];state.alerts=r.alerts||[];renderHighlights();renderSoWhat();renderSources();renderAsk();if(typeof window.renderPhase2gDashboard==='function')await window.renderPhase2gDashboard();}catch(err){console.warn('Scope refresh failed',err);window.toast?.('Filter gagal dimuat: '+err.message)}
 }
 const changed=()=>window.dispatchEvent(new CustomEvent('command-center-scope-changed'));
 if(opdGroupSelect)opdGroupSelect.addEventListener('change',async()=>{state.opd='all';renderOpdOptions();changed();await refresh()});opdSelect.addEventListener('change',async e=>{state.opd=e.target.value;changed();await refresh()});districtSelect.addEventListener('change',async e=>{state.district=e.target.value;changed();await refresh()});
 window.addEventListener('media-branding-ready',()=>void options());
 const centerAdmin=()=>{const a=document.getElementById('adminNavBtn');if(a){a.style.textAlign='center';a.style.justifyContent='center';a.style.alignItems='center';a.style.display='flex'}};centerAdmin();new MutationObserver(centerAdmin).observe(document.body,{childList:true,subtree:true});
 options().then(refresh).catch(e=>console.warn('Scope init failed',e));
})();