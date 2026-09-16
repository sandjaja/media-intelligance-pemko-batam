(()=>{
 const districtSelect=document.getElementById('districtSelect'),opdSelect=document.getElementById('opdSelect');
 if(!districtSelect||!opdSelect||typeof api!=='function'||typeof state==='undefined')return;
 const branding=()=>window.getMediaBranding?.()||window.MEDIA_BRANDING||{};
 const governmentShort=()=>branding().short_name||branding().government_name||'Pemerintah Daerah';
 const cityName=()=>branding().city_name||'';
 state.district=state.district||'all';state.districtList=state.districtList||[];
 async function options(){if(window.MEDIA_BRANDING_READY)await window.MEDIA_BRANDING_READY.catch(()=>null);const [o,d]=await Promise.all([api('/opd'),api('/districts')]);state.opdList=o.data||[];state.districtList=d.data||[];opdSelect.innerHTML=`<option value="all">Semua OPD / ${esc(governmentShort())}</option>`+state.opdList.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');districtSelect.innerHTML=`<option value="all">${cityName()?`Semua Kecamatan / ${esc(cityName())}`:'Semua Kecamatan'}</option>`+state.districtList.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');opdSelect.value=state.opd;districtSelect.value=state.district}
 async function refresh(){
  if(state.tab==='printarchive'){
   try{await window.renderPrintArchive?.();setTimeout(()=>window.applyPrintArchiveGlobalScope?.(),80);return}catch(err){console.warn('Print archive scope refresh failed',err);window.toast?.('Filter Arsip Media Cetak gagal dimuat: '+err.message);return}
  }
  const q=new URLSearchParams();if(state.opd!=='all')q.set('opdId',String(state.opd));if(state.district!=='all')q.set('districtId',String(state.district));
  try{const r=await api('/command-center/scope'+(q.toString()?`?${q}`:''));state.metrics=r.metrics||{};state.articles=r.articles||[];state.highlights=r.highlights||[];state.alerts=r.alerts||[];renderHighlights();renderSoWhat();renderSources();renderAsk();if(state.tab==='dashboard'&&typeof window.renderPhase2gDashboard==='function')await window.renderPhase2gDashboard();const on=state.opd==='all'?'Seluruh OPD':state.opdList.find(x=>String(x.id)===String(state.opd))?.name||'OPD terpilih',dn=state.district==='all'?'Seluruh Kecamatan':state.districtList.find(x=>String(x.id)===String(state.district))?.name||'Kecamatan terpilih';const t=document.getElementById('alertText');if(t)t.textContent=`Scope: ${on} · ${dn} · ${state.articles.length} artikel · ${state.highlights.length} highlight · ${state.alerts.length} open alert.`}catch(err){console.warn('Scope refresh failed',err);window.toast?.('Filter gagal dimuat: '+err.message)}
 }
 opdSelect.onchange=async e=>{state.opd=e.target.value;await refresh()};districtSelect.onchange=async e=>{state.district=e.target.value;await refresh()};
 window.addEventListener('media-branding-ready',()=>void options());
 const centerAdmin=()=>{const a=document.getElementById('adminNavBtn');if(a){a.style.textAlign='center';a.style.justifyContent='center';a.style.alignItems='center';a.style.display='flex'}};centerAdmin();new MutationObserver(centerAdmin).observe(document.body,{childList:true,subtree:true});
 options().then(refresh).catch(e=>console.warn('Scope init failed',e));
})();