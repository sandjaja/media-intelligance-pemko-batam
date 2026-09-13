(() => {
  const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';
  const esc = (v) => String(v ?? '').replace(/[&<>\'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const score = v => Math.max(0, Math.min(100, Number(v || 0)));
  const fmt = v => v ? new Date(v).toLocaleString('id-ID', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '-';
  async function api(path) { const r = await fetch(API_BASE + path, {credentials:'include'}); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

  function classify(n) {
    const risk = String(n.risk_level || 'low').toLowerCase();
    const sentiment = String(n.sentiment || '').toLowerCase();
    const impact = score(n.impact_score), velocity = score(n.velocity_score), importance = score(n.importance_score);
    const critical = risk === 'critical' || score(n.risk_score) >= 80;
    const high = critical || risk === 'high' || score(n.risk_score) >= 60;
    const urgency = critical ? 'IMMEDIATE' : high || velocity >= 70 ? 'HIGH' : impact >= 55 ? 'MEDIUM' : 'WATCH';
    const owner = impact >= 75 || critical ? 'Pimpinan/OPD terkait + Humas/Komunikasi' : 'OPD terkait + Humas';
    const response = critical ? 'Bentuk rapid response cell, validasi fakta, tetapkan satu juru bicara, dan siapkan holding statement.' : high ? 'Validasi fakta lintas OPD, siapkan key message dan respons teknis, lalu pantau eskalasi.' : sentiment === 'negative' ? 'Pantau narasi, siapkan klarifikasi berbasis fakta, dan ukur momentum pemberitaan.' : 'Monitor perkembangan dan siapkan konteks positif bila isu berkembang.';
    const deadline = critical ? '< 30 menit' : high ? '< 2 jam' : impact >= 55 ? '< 6 jam' : 'Hari ini';
    return {urgency,owner,response,deadline,critical,high};
  }

  function render(article, alerts) {
    const el = document.getElementById('sowhat'); if (!el) return;
    if (!article) { el.innerHTML = '<div class="glass rounded-2xl p-6"><span class="text-[10px] font-black tracking-widest text-cyan-400">SO WHAT? ENGINE</span><h2 class="text-xl font-black mt-2">Belum ada isu untuk dianalisis</h2><p class="text-xs text-slate-400 mt-2">Engine akan aktif setelah artikel tersedia di database.</p></div>'; return; }
    const c = classify(article);
    const related = alerts.filter(a => String(a.article_id) === String(article.id));
    const keyMessage = c.critical ? 'Pemko sedang memverifikasi fakta dan mengoordinasikan penanganan. Informasi resmi akan disampaikan melalui kanal pemerintah.' : article.sentiment === 'negative' ? 'Pemko memahami perhatian publik, melakukan verifikasi, dan menyiapkan langkah penanganan berbasis fakta.' : 'Perkembangan positif akan terus diperkuat dengan informasi yang terukur dan dapat diverifikasi.';
    const drivers = [`Risk ${score(article.risk_score)}/100`, `Impact ${score(article.impact_score)}/100`, `Importance ${score(article.importance_score)}/100`, `Velocity ${score(article.velocity_score)}/100`];
    el.innerHTML = `<div class="glass rounded-2xl p-5 border ${c.critical?'border-rose-500/50':c.high?'border-orange-500/40':'border-slate-800'}">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><span class="text-[10px] font-black tracking-[.22em] text-cyan-400">DEEP INTELLIGENCE · SO WHAT? ENGINE</span><h2 class="text-xl font-black mt-1">From News Signal → Communication Decision</h2><p class="text-xs text-slate-400 mt-1">Analisis deterministik berbasis risk, impact, importance, velocity dan sentiment.</p></div><span class="px-3 py-2 rounded-lg border ${c.critical?'text-rose-300 bg-rose-500/10 border-rose-500/30':c.high?'text-orange-300 bg-orange-500/10 border-orange-500/30':'text-cyan-300 bg-cyan-500/10 border-cyan-500/30'} text-xs font-black">${c.urgency}</span></div>
      <div class="mt-5 rounded-xl bg-slate-950/70 border border-slate-800 p-4"><div class="text-[10px] text-slate-500">SELECTED SIGNAL · ${esc(article.source_name || 'Unknown')} · ${fmt(article.published_at)}</div><h3 class="text-lg font-bold mt-2">${esc(article.title)}</h3><p class="text-xs text-slate-400 mt-2">${esc(article.summary || 'Ringkasan belum tersedia.')}</p><div class="flex flex-wrap gap-2 mt-3">${drivers.map(x=>`<span class="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px]">${esc(x)}</span>`).join('')}</div></div>
      <div class="grid lg:grid-cols-2 gap-4 mt-4"><div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4"><b class="text-cyan-300 text-[10px] tracking-widest">WHAT HAPPENED</b><p class="text-sm mt-2">Sinyal pemberitaan terdeteksi dari <b>${esc(article.source_name || 'media source')}</b> dengan sentiment <b>${esc(article.sentiment || 'unknown')}</b> dan risk level <b>${esc(article.risk_level || 'low')}</b>.</p></div><div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4"><b class="text-amber-300 text-[10px] tracking-widest">WHY IT MATTERS</b><p class="text-sm mt-2">Impact <b>${score(article.impact_score)}/100</b> dan risk <b>${score(article.risk_score)}/100</b> menentukan urgensi respons komunikasi.</p></div><div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4"><b class="text-rose-300 text-[10px] tracking-widest">WHAT SHOULD WE DO</b><p class="text-sm mt-2">${esc(c.response)}</p></div><div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4"><b class="text-purple-300 text-[10px] tracking-widest">WHO · WHEN</b><p class="text-sm mt-2"><b>${esc(c.owner)}</b><br><span class="text-slate-400">Target respons: ${esc(c.deadline)}</span></p></div></div>
      <div class="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"><b class="text-cyan-300 text-[10px] tracking-widest">RECOMMENDED KEY MESSAGE</b><p class="text-sm mt-2 font-semibold">“${esc(keyMessage)}”</p></div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>${related.length ? `${related.length} active alert terkait signal ini` : 'Tidak ada active alert langsung'}</span><span>Engine mode: deterministic · AI provider belum diaktifkan</span></div>
    </div>`;
  }

  async function load() {
    const el = document.getElementById('sowhat'); if (!el) return;
    try {
      const opd = document.getElementById('opdSelect')?.value;
      const qs = opd && opd !== 'all' ? `?opdId=${encodeURIComponent(opd)}&limit=25` : '?limit=25';
      const [articles, alerts] = await Promise.all([api(`/articles${qs}`), api(`/alerts${qs}&status=open`)]);
      const rows = Array.isArray(articles.data) ? articles.data : [];
      const ranked = rows.slice().sort((a,b) => Number(b.risk_score||0)-Number(a.risk_score||0) || Number(b.impact_score||0)-Number(a.impact_score||0));
      render(ranked[0], Array.isArray(alerts.data) ? alerts.data : []);
    } catch (e) { el.innerHTML = `<div class="glass rounded-2xl p-5 text-xs text-amber-300"><i class="fa-solid fa-triangle-exclamation mr-2"></i>So What Engine gagal memuat data: ${esc(e.message)}</div>`; }
  }

  function boot() {
    const original = window.showTab;
    if (typeof original === 'function' && !window.__soWhatWrapped) { window.showTab = function(id) { original(id); if (id === 'sowhat') load(); }; window.__soWhatWrapped = true; }
    document.getElementById('opdSelect')?.addEventListener('change', () => { if (document.getElementById('sowhat')?.classList.contains('hidden') === false) load(); });
    if (document.getElementById('sowhat')?.classList.contains('hidden') === false) load();
    setInterval(() => { if (document.getElementById('sowhat')?.classList.contains('hidden') === false) load(); }, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.refreshSoWhatEngine = load;
})();
