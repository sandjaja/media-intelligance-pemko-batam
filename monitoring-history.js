(() => {
  const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';
  let timer;

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate = (value) => value ? new Date(value).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '-';
  const fmtDuration = (start, finish) => {
    if (!start || !finish) return 'running';
    const ms = Math.max(0, new Date(finish).getTime() - new Date(start).getTime());
    return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms/1000).toFixed(1)} dtk` : `${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`;
  };

  async function getHistory() {
    const response = await fetch(`${API_BASE}/ingestion/history?limit=24`, { credentials:'include' });
    if (!response.ok) throw new Error(`history ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.data) ? payload.data : [];
  }

  function ensurePanel() {
    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return null;
    let panel = document.getElementById('monitoringHistoryPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'monitoringHistoryPanel';
      panel.className = 'glass rounded-2xl p-5';
      dashboard.appendChild(panel);
    }
    return panel;
  }

  function render(rows) {
    const panel = ensurePanel();
    if (!panel) return;
    const now = Date.now();
    const dayRows = rows.filter(r => now - new Date(r.started_at).getTime() <= 86400000);
    const completed = dayRows.filter(r => r.status === 'completed');
    const fetched = dayRows.reduce((n,r) => n + Number(r.fetched_count || 0), 0);
    const inserted = dayRows.reduce((n,r) => n + Number(r.inserted_count || 0), 0);
    const failedSources = dayRows.reduce((n,r) => n + Number(r.failed_sources || 0), 0);
    const successRate = dayRows.length ? Math.round((completed.length / dayRows.length) * 100) : 0;
    const health = failedSources ? 'DEGRADED' : dayRows.length ? 'HEALTHY' : 'NO HISTORY';
    const healthClass = failedSources ? 'text-amber-300' : dayRows.length ? 'text-emerald-300' : 'text-slate-400';

    panel.innerHTML = `<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><div class="text-[10px] font-black tracking-[.22em] text-cyan-400">MONITORING HISTORY</div><h2 class="text-lg font-black mt-1">Ingestion Command Timeline</h2><p class="text-xs text-slate-400 mt-1">Riwayat siklus monitoring 24 jam terakhir · <span class="${healthClass} font-bold">${health}</span></p></div>
      <button id="refreshHistoryBtn" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold"><i class="fa-solid fa-rotate mr-1"></i> Refresh</button>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      ${[['CYCLES / 24H',dayRows.length,'text-cyan-300'],['SUCCESS RATE',`${successRate}%`,'text-emerald-300'],['ARTICLES FETCHED',fetched,'text-blue-300'],['NEW ARTICLES',inserted,'text-amber-300']].map(([l,v,c])=>`<div class="rounded-xl bg-slate-950/70 border border-slate-800 p-3"><div class="text-[9px] tracking-widest text-slate-500 font-bold">${l}</div><div class="text-xl font-black ${c} mt-1">${esc(v)}</div></div>`).join('')}
    </div>
    <div class="space-y-2">
      ${rows.length ? rows.slice(0,12).map(r => {
        const failed = Number(r.failed_sources || 0) > 0 || r.status === 'failed';
        const status = r.status === 'running' ? 'RUNNING' : failed ? 'INCIDENT' : 'COMPLETED';
        const statusClass = r.status === 'running' ? 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20' : failed ? 'text-rose-300 bg-rose-400/10 border-rose-400/20' : 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20';
        return `<div class="rounded-xl border ${failed ? 'border-rose-500/30' : 'border-slate-800'} bg-slate-950/50 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full ${failed ? 'bg-rose-400' : 'bg-emerald-400'}"></span><span class="font-bold text-sm">${fmtDate(r.started_at)}</span><span class="text-[10px] text-slate-500">${fmtDuration(r.started_at,r.finished_at)}</span></div><span class="px-2 py-1 rounded-md border text-[9px] font-black tracking-wider ${statusClass}">${status}</span></div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[10px]"><span class="text-slate-400">Sources <b class="text-slate-200">${Number(r.successful_sources||0)}/${Number(r.source_count||0)}</b></span><span class="text-slate-400">Fetched <b class="text-slate-200">${Number(r.fetched_count||0)}</b></span><span class="text-slate-400">New <b class="text-amber-300">${Number(r.inserted_count||0)}</b></span><span class="text-slate-400">Failed <b class="${failed ? 'text-rose-300' : 'text-slate-200'}">${Number(r.failed_sources||0)}</b></span></div>
          ${r.error_message ? `<div class="mt-2 text-[10px] text-rose-300"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${esc(r.error_message)}</div>` : ''}
        </div>`;
      }).join('') : `<div class="rounded-xl border border-dashed border-slate-700 p-8 text-center text-xs text-slate-500">Belum ada riwayat ingestion. Jalankan monitoring pertama untuk mulai merekam timeline.</div>`}
    </div>`;
    document.getElementById('refreshHistoryBtn')?.addEventListener('click', load);
  }

  async function load() {
    try { render(await getHistory()); }
    catch (error) {
      const panel = ensurePanel();
      if (panel) panel.innerHTML = `<div class="text-xs text-amber-300"><i class="fa-solid fa-plug-circle-xmark mr-2"></i>Monitoring history belum dapat dimuat. ${esc(error.message)}</div>`;
    }
  }

  function boot() {
    load();
    timer = setInterval(load, 60000);
    const dashboard = document.getElementById('dashboard');
    if (dashboard && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        if (!document.getElementById('monitoringHistoryPanel')) load();
      });
      observer.observe(dashboard, { childList:true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
  window.refreshMonitoringHistory = load;
})();
