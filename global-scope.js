(()=>{
  const districtSelect=document.getElementById('districtSelect');
  if(!districtSelect||typeof api!=='function'||typeof state==='undefined')return;

  state.district=state.district||'all';
  state.districtList=state.districtList||[];

  async function loadDistrictOptions(){
    const result=await api('/districts');
    state.districtList=result.data||[];
    districtSelect.innerHTML='<option value="all">Semua Kecamatan / Kota Batam</option>'+state.districtList.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    districtSelect.value=state.district;
  }

  async function renderCurrentTab(){
    renderHighlights();renderScan();renderSoWhat();renderSources();renderAsk();
    if(state.tab==='dashboard'){
      if(typeof window.renderPhase2gDashboard==='function') await window.renderPhase2gDashboard();
      else {renderDashboard();drawChart();}
    }else{
      renderDashboard();
    }
    if(state.tab==='printarchive') window.renderPrintArchive?.();
  }

  const originalLoad=load;
  load=async function(){
    try{
      const [opdResult,scopeResult,health]=await Promise.all([
        api('/opd'),
        api('/command-center/scope?'+new URLSearchParams({
          ...(state.opd!=='all'?{opdId:String(state.opd)}:{}),
          ...(state.district!=='all'?{districtId:String(state.district)}:{})
        }).toString()),
        api('/ingestion/status')
      ]);
      state.opdList=opdResult.data||[];
      const opdSelect=document.getElementById('opdSelect');
      opdSelect.innerHTML='<option value="all">Semua OPD / Pemko Batam</option>'+state.opdList.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
      opdSelect.value=state.opd;
      districtSelect.value=state.district;
      state.metrics=scopeResult.metrics||{};
      state.articles=scopeResult.articles||[];
      state.highlights=scopeResult.highlights||[];
      state.alerts=scopeResult.alerts||[];
      state.health=health;
      state.sources=health.sources||[];
      await renderCurrentTab();
      const districtName=state.district==='all'?'Seluruh Kecamatan':(state.districtList.find(d=>String(d.id)===String(state.district))?.name||'Kecamatan terpilih');
      const opdName=state.opd==='all'?'Seluruh OPD':(state.opdList.find(o=>String(o.id)===String(state.opd))?.name||'OPD terpilih');
      const alertText=document.getElementById('alertText');
      if(alertText)alertText.textContent=`Scope: ${opdName} · ${districtName} · ${state.articles.length} artikel · ${state.highlights.length} highlight · ${state.alerts.length} open alert.`;
    }catch(e){
      console.warn('Global scope load fallback:',e);
      return originalLoad();
    }
  };

  const opdSelect=document.getElementById('opdSelect');
  if(opdSelect)opdSelect.onchange=async e=>{state.opd=e.target.value;await load();};
  districtSelect.onchange=async e=>{state.district=e.target.value;await load();};
  loadDistrictOptions().then(()=>load()).catch(e=>console.warn('District filter init failed:',e));
})();