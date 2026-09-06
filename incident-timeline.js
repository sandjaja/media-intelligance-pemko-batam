(() => {
  const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';
  let refreshTimer;
  let busy = false;
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate = (value) => value ? new Date(value).toLocaleString('id-ID', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '-';
  const ageMinutes = (value) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  const severity = (row) => String(row.severity || row.risk_level || '').toLowerCase();
  const escalation = (row) => {
    const age = ageMinutes(row.created_at);
    const sev = severity(row);
    if (row.status === 'resolved') return {label:'RESOLVED', cls:'text-emerald-300 bg-emerald-400/10 border-emerald-400/20'};
    if (sev === 'critical' || row.alert_type === 'CRITICAL_MEDIA_RISK') return age >= 30 ? {label:'ESCALATE NOW', cls:'text-rose-200 bg-rose-500/20 border-rose-400/40'} : {label:'CRITICAL', cls:'text-rose-300 bg-rose-400/10 border-rose-400/20'};
    if (age >= 60) return {label:'ESCALATE', cls:'text-amber-200 bg-amber-400/15 border-amber-400/30'};
    if (age >= 30) return {label:'AGING', cls:'text-amber-300 bg-amber-400/10 border-amber-400/20'};
    return {label:'MONITOR', cls:'text-cyan-300 bg-cyan-400/10 border-cyan-400/20'};
  };

  async function getAlerts(status) {
    const response = await fetch(`${API_BASE}/alerts?status=${status}&limit=100`, {credentials:'include'});
    if (!response.ok) throw new Error(`alerts ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
  }
  async function getHistory() {
    const response = await fetch(`${API_BASE}/ingestion/history?limit=24`, {credentials:'include'});
    if (!response.ok) throw new Error(`history ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
  }
  async function setAlert(id, status) {
    const response = await fetch(`${API_BASE}/alerts/${encodeURIComponent(id)}`, {method:'PATCH',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify({status})});
    if (!response.ok) throw new Error(`alert update ${response.status}`);
  }

  function ensurePanel() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return null;
    let panel = document.getElementById('incidentTimelinePanel');
    if (!panel) { panel = document.createElement('section'); panel.id='incidentTimelinePanel'; panel.className='glass rounded-2xl p-5'; dashboard.appendChild(panel); }
    return panel;
  }

  function render(alerts, history) {
    const panel = ensurePanel(); if (!panel) return;
    const now = Date.now();
    const open = alerts.filter(a => a.status === 'open');
    const acknowledged = alerts.filter(a => a.status === 'acknowledged');
    const critical = alerts.filter(a => ['critical','CRITICAL_MEDIA_RISK'].includes(severity(a)) || a.alert_type === 'CRITICAL_MEDIA_RISK');
    const escalated = open.filter(a => escalation(a).label === 'ESCALATE NOW' || escalation(a).label === 'ESCALATE');
    const incidents = history.filter(r => Number(r.failed_sources||0)>0 || r.status === 'failed').map(r => ({kind:'INGESTION',at:r.started_at,title:`Monitoring ${Number(r.failed_sources||0)} source gagal`,detail:`${Number(r.successful_sources||0)}/${Number(r.source_count||0)} source berhasil · ${Number(r.inserted_count||0)} berita baru`,level:'incident',status:'INCIDENT'}));
    const alertEvents = alerts.map(a => ({kind:'ALERT',at:a.created_at,title:a.title || 'Media risk alert',detail:`${a.source_name || 'Sumber tidak diketahui'} · ${a.reason || a.alert_type || 'Risk detected'}`,level:severity(a),status:a.status,alert:a}));
    const events = [...incidents,...alertEvents].sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime()).slice(0,20);
    const openCount=open.length, ackCount=acknowledged.length, criticalCount=critical.filter(a=>a.status!=='resolved').length;
    const health = escalated.length ? 'ESCALATION REQUIRED' : criticalCount ? 'CRITICAL WATCH' : openCount ? 'ACTIVE WATCH' : 'STABLE';
    const healthClass = escalated.length || criticalCount ? 'text-rose-300' : openCount ? 'text-amber-300' : 'text-emerald-300';

    panel.innerHTML = `<div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><div class="text-[10px] font-black tracking-[.22em] text-rose-400">INCIDENT TIMELINE + ALERT ESCALATION</div><h2 class="text-lg font-black mt-1">Media Risk Command Center</h2><p class="text-xs text-slate-400 mt-1">${esc(health)} · prioritas ditentukan dari severity + umur alert</p></div><button id="refreshIncidentBtn" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-rotate mr-1"></i> Refresh</button></div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${[['OPEN',openCount,'text-rose-300'],['ACKNOWLEDGED',ackCount,'text-amber-300'],['CRITICAL',criticalCount,'text-rose-200'],['ESCALATION',escalated.length,'text-orange-300']].map(([l,v,c])=>`<div class="rounded-xl bg-slate-950/70 border border-slate-800 p-3"><div class="text-[9px] tracking-widest text-slate-500 font-bold">${l}</div><div class="text-xl font-black ${c} mt-1">${esc(v)}</div></div>`).join('')}
      </div>
      <div class="space-y-2">${events.length ? events.map(e => {
        const isIngest=e.kind==='INGESTION'; const a=e.alert; const escInfo=!isIngest&&a?escalation(a):{label:'INCIDENT',cls:'text-rose-300 bg-rose-400/10 border-rose-400/20'};
        const age=!isIngest&&a?ageMinutes(a.created_at):null;
        return `<article class="rounded-xl border ${escInfo.label.includes('ESCALATE')?'border-rose-500/40':'border-slate-800'} bg-slate-950/50 p-3"><div class="flex flex-wrap items-start justify-between gap-3"><div class="flex gap-3"><div class="mt-1 w-8 h-8 rounded-lg ${isIngest?'bg-orange-400/10 text-orange-300':'bg-rose-400/10 text-rose-300'} grid place-items-center"><i class="fa-solid ${isIngest?'fa-tower-broadcast':'fa-triangle-exclamation'}"></i></div><div><div class="flex flex-wrap items-center gap-2"><span class="text-[9px] font-black tracking-wider ${isIngest?'text-orange-300':'text-rose-300'}">${e.kind}</span><span class="text-xs font-bold">${esc(e.title)}</span></div><div class="text-[10px] text-slate-500 mt-1">${fmtDate(e.at)}${age !== null ? ` · umur ${age} menit` : ''}</div><div class="text-[10px] text-slate-400 mt-2">${esc(e.detail)}</div></div></div><span class="px-2 py-1 rounded-md border text-[9px] font-black tracking-wider ${escInfo.cls}">${esc(escInfo.label)}</span></div>${a ? `<div class="mt-3 flex flex-wrap gap-2 items-center"><span class="text-[9px] px-2 py-1 rounded bg-slate-800 text-slate-300">${esc(a.alert_type || 'MEDIA_RISK')}</span><span class="text-[9px] px-2 py-1 rounded bg-slate-800 text-slate-300">score ${Number(a.risk_score||0)}</span><span class="text-[9px] px-2 py-1 rounded bg-slate-800 text-slate-300">${esc(a.status)}</span>${a.status==='open'?`<button data-alert-action="ack" data-alert-id="${esc(a.id)}" class="ml-auto px-2 py-1 rounded-md bg-amber-400/10 border border-amber-400/20 text-amber-200 text-[9px] font-bold">ACKNOWLEDGE</button>`:''}${a.status==='acknowledged'?`<button data-alert-action="resolve" data-alert-id="${esc(a.id)}" class="ml-auto px-2 py-1 rounded-md bg-emerald-400/10 border border-emerald-400/20 text-emerald-200 text-[9px] font-bold">RESOLVE</button>`:''}</div>`:''}</article>`;
      }).join('') : `<div class="rounded-xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-500">Tidak ada incident atau alert pada timeline.</div>`}</div>`;
    panel.querySelector('#refreshIncidentBtn')?.addEventListener('click', load);
    panel.querySelectorAll('[data-alert-action]').forEach(btn => btn.addEventListener('click', async () => { if (busy) return; busy=true; btn.disabled=true; try { await setAlert(btn.dataset.alertId, btn.dataset.alertAction==='ack'?'acknowledged':'resolved'); await load(); } catch(e) { alert(`Gagal mengubah alert: ${e.message}`); btn.disabled=false; } finally { busy=false; } }));
  }

  async function load() { try { const [open,ack,resolved,history]=await Promise.all([getAlerts('open'),getAlerts('acknowledged'),getAlerts('resolved'),getHistory()]); render([...open,...ack,...resolved],history); } catch(e) { const panel=ensurePanel(); if(panel) panel.innerHTML=`<div class="text-xs text-amber-300"><i class="fa-solid fa-plug-circle-xmark mr-2"></i>Incident timeline belum dapat dimuat. ${esc(e.message)}</div>`; } }
  function boot() { load(); refreshTimer=setInterval(load,60000); const dashboard=document.getElementById('dashboard'); if(dashboard&&window.MutationObserver){const observer=new MutationObserver(()=>{if(!document.getElementById('incidentTimelinePanel')) load();}); observer.observe(dashboard,{childList:true});} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.refreshIncidentTimeline=load;
})();
