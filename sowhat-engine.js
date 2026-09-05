(() => {
  const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';

  /**
   * HTML escape to prevent XSS attacks
   * @param {*} v - Value to escape
   * @returns {string} Escaped string
   */
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));

  /**
   * Score normalization (0-100)
   * @param {*} v - Value to normalize
   * @returns {number} Normalized score
   */
  const score = v => Math.max(0, Math.min(100, Number(v || 0)));

  /**
   * Format datetime for Indonesian locale
   * @param {string|Date} v - Value to format
   * @returns {string} Formatted date
   */
  const fmt = v => v ? new Date(v).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }) : '-';

  /**
   * Fetch API with error handling
   * @param {string} path - API path
   * @returns {Promise<Object>} JSON response
   */
  async function api(path) {
    const r = await fetch(API_BASE + path, { credentials: 'include' });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    return r.json();
  }

  /**
   * Classify article and determine response strategy
   * @typedef {Object} ClassificationResult
   * @property {string} urgency - IMMEDIATE|HIGH|MEDIUM|WATCH
   * @property {string} owner - Responsible party
   * @property {string} response - Recommended response
   * @property {string} deadline - Action deadline
   * @property {boolean} critical - Is critical
   * @property {boolean} high - Is high level
   *
   * @param {Object} n - Article/narrative object
   * @returns {ClassificationResult} Classification
   */
  function classify(n) {
    const risk = String(n.risk_level || 'low').toLowerCase();
    const sentiment = String(n.sentiment || '').toLowerCase();
    const impact = score(n.impact_score);
    const velocity = score(n.velocity_score);
    const importance = score(n.importance_score);
    const critical = risk === 'critical' || score(n.risk_score) >= 80;
    const high = critical || risk === 'high' || score(n.risk_score) >= 60;

    const urgency = critical ? 'IMMEDIATE' : high || velocity >= 70 ? 'HIGH' : impact >= 55 ? 'MEDIUM' : 'WATCH';
    const owner = impact >= 75 || critical ? 'Pimpinan/OPD terkait + Humas/Komunikasi' : 'OPD terkait + Humas';
    const response = critical
      ? 'Bentuk rapid response cell, validasi fakta, tetapkan satu juru bicara, dan siapkan holding statement.'
      : high
      ? 'Validasi fakta lintas OPD, siapkan key message dan siaran pers.'
      : 'Monitor situasi, siapkan Q&A internal.';
    const deadline = critical ? '< 30 menit' : high ? '< 2 jam' : impact >= 55 ? '< 6 jam' : 'Hari ini';

    return { urgency, owner, response, deadline, critical, high };
  }

  /**
   * Render So What Engine display
   * @param {Object} article - Article to display (nullable)
   * @param {Array} alerts - Related alerts
   */
  function render(article, alerts) {
    const el = document.getElementById('sowhat');
    if (!el) return;

    if (!article) {
      el.innerHTML = `<div class="glass rounded-2xl p-6 text-center">
        <span class="text-[10px] font-black tracking-widest text-cyan-400">SO WHAT? ENGINE</span>
        <h2 class="text-xl font-black mt-2">Tidak ada artikel untuk dianalisis</h2>
        <p class="text-slate-400 text-sm mt-3">Tunggu sampai data media teringesti...</p>
      </div>`;
      return;
    }

    const c = classify(article);
    const related = Array.isArray(alerts) ? alerts.filter(a => String(a.article_id) === String(article.id)) : [];

    const keyMessage = c.critical
      ? 'Pemko sedang memverifikasi fakta dan mengoordinasikan penanganan. Informasi resmi akan disampaikan melalui kanal pemerintah.'
      : sentiment === 'negative'
      ? `Kami memahami kekhawatiran terkait ${esc(article.headline || 'isu ini')}. Pemko berkomitmen untuk mengatasi dengan transparan.`
      : 'Terima kasih atas perhatian. Kami terus memantau situasi.';

    const drivers = [
      `Risk ${score(article.risk_score)}/100`,
      `Impact ${score(article.impact_score)}/100`,
      `Importance ${score(article.importance_score)}/100`,
      `Velocity ${score(article.velocity_score)}/100`
    ];

    el.innerHTML = `<div class="glass rounded-2xl p-5 border ${c.critical ? 'border-rose-500/50' : c.high ? 'border-orange-500/40' : 'border-slate-800'}">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span class="text-[10px] font-black tracking-[.22em] text-cyan-400">DEEP INTELLIGENCE · SO WHAT? ENGINE</span>
          <h2 class="text-xl font-black mt-1">
            <span class="inline-block px-2 py-1 rounded text-xs mr-2 ${c.critical ? 'bg-rose-500/20 text-rose-300' : c.high ? 'bg-orange-500/20 text-orange-300' : 'bg-emerald-500/20 text-emerald-300'}">
              ${esc(c.urgency)}
            </span>
            ${esc(article.headline || 'Signal')}
          </h2>
        </div>
        <div class="text-right text-xs text-slate-500">
          <div>Risk Level: <b>${esc(String(article.risk_level || 'low').toUpperCase())}</b></div>
          <div>Sentiment: <b>${esc(sentiment.toUpperCase() || 'NEUTRAL')}</b></div>
        </div>
      </div>

      <div class="mt-5 rounded-xl bg-slate-950/70 border border-slate-800 p-4">
        <div class="text-[10px] text-slate-500 mb-2">SELECTED SIGNAL</div>
        <div class="flex justify-between text-sm mb-3">
          <div>
            <b>${esc(article.source_name || 'Unknown Source')}</b>
            <div class="text-xs text-slate-500">${fmt(article.published_at)}</div>
          </div>
          <div class="text-right">
            <div class="text-[10px] text-slate-500">Reach</div>
            <div class="text-lg font-black">${score(article.reach_score || 0)}</div>
          </div>
        </div>
        <p class="text-sm text-slate-300">${esc(article.content?.substring(0, 200) || article.headline || '')}</p>
      </div>

      <div class="grid lg:grid-cols-2 gap-4 mt-4">
        <div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4">
          <b class="text-cyan-300 text-[10px] tracking-widest">WHAT HAPPENED</b>
          <p class="text-sm mt-2 text-slate-300">${esc(article.summary || article.content?.substring(0, 300) || 'Analysis pending...')}</p>
        </div>
        <div class="rounded-xl bg-slate-950/60 border border-slate-800 p-4">
          <b class="text-cyan-300 text-[10px] tracking-widest">SO WHAT?</b>
          <p class="text-sm mt-2 text-slate-300">
            ${c.critical ? 'Crisis level situation requiring immediate escalation.' : c.high ? 'Significant issue needing urgent response.' : 'Requires monitoring and potential response planning.'}
          </p>
          <div class="mt-3 flex flex-wrap gap-1">
            ${drivers.map(d => `<span class="px-2 py-1 rounded-md text-xs bg-slate-900 text-slate-300">${esc(d)}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <b class="text-cyan-300 text-[10px] tracking-widest">RECOMMENDED KEY MESSAGE</b>
        <p class="text-sm mt-2 font-semibold text-cyan-200">${esc(keyMessage)}</p>
        <div class="mt-3 text-[10px] text-slate-500 space-y-1">
          <div><b>Action Owner:</b> ${esc(c.owner)}</div>
          <div><b>Deadline:</b> ${esc(c.deadline)}</div>
          <div><b>Response Strategy:</b> ${esc(c.response)}</div>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>${related.length ? `${related.length} active alert${related.length !== 1 ? 's' : ''} terkait signal ini` : 'Tidak ada active alerts untuk signal ini'}</span>
        <button onclick="window.refreshSoWhatEngine?.()" class="px-2 py-1 rounded border border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-300">
          <i class="fa-solid fa-refresh"></i> Refresh
        </button>
      </div>
    </div>`;
  }

  /**
   * Load and render So What Engine data
   */
  async function load() {
    const el = document.getElementById('sowhat');
    if (!el) return;

    try {
      const opdSelect = document.getElementById('opdSelect');
      const opd = opdSelect?.value;
      const qs = opd && opd !== 'all' ? `?opdId=${encodeURIComponent(opd)}&limit=25` : '?limit=25';

      // Load articles and alerts in parallel with error recovery
      const [articlesResp, alertsResp] = await Promise.all([
        api(`/articles${qs}`).catch(e => {
          console.warn('Articles load failed:', e);
          return { data: [] };
        }),
        api(`/alerts${qs}&status=open`).catch(e => {
          console.warn('Alerts load failed:', e);
          return { data: [] };
        })
      ]);

      // Safely extract arrays with null checks
      const articles = Array.isArray(articlesResp?.data) ? articlesResp.data : [];
      const alerts = Array.isArray(alertsResp?.data) ? alertsResp.data : [];

      if (articles.length === 0) {
        render(null, alerts);
        return;
      }

      // Sort by risk score descending, then impact
      const ranked = articles
        .slice()
        .sort((a, b) =>
          Number(b.risk_score || 0) - Number(a.risk_score || 0) ||
          Number(b.impact_score || 0) - Number(a.impact_score || 0)
        );

      render(ranked[0], alerts);
    } catch (e) {
      const el = document.getElementById('sowhat');
      if (el) {
        el.innerHTML = `<div class="glass rounded-2xl p-5 text-xs text-amber-300 border border-amber-500/30">
          <i class="fa-solid fa-triangle-exclamation mr-2"></i>
          So What Engine gagal memuat data: ${esc(e.message || 'Unknown error')}
        </div>`;
      }
      console.error('So What Engine error:', e);
    }
  }

  /**
   * Debounce utility
   * @param {Function} fn - Function to debounce
   * @param {number} delay - Delay in ms
   * @returns {Function} Debounced function
   */
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Setup polling with Page Visibility API optimization
   */
  function setupPolling() {
    let pollInterval = null;

    function startPolling() {
      if (pollInterval) clearInterval(pollInterval);
      if (document.hidden) return;

      pollInterval = setInterval(() => {
        const sowhatEl = document.getElementById('sowhat');
        if (!document.hidden && sowhatEl && !sowhatEl.classList.contains('hidden')) {
          load();
        }
      }, 60000); // Poll every 60 seconds
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    });

    // Start initial polling
    startPolling();
  }

  /**
   * Initialize So What Engine
   */
  function boot() {
    // Wrap showTab to trigger load when tab shown
    const original = window.showTab;
    if (typeof original === 'function' && !window.__soWhatWrapped) {
      window.showTab = function (id) {
        original(id);
        if (id === 'sowhat') load();
      };
      window.__soWhatWrapped = true;
    }

    // Debounced OPD change handler
    const debouncedLoad = debounce(load, 300);
    const opdSelect = document.getElementById('opdSelect');
    if (opdSelect) {
      opdSelect.addEventListener('change', () => {
        if (!document.getElementById('sowhat')?.classList.contains('hidden')) {
          debouncedLoad();
        }
      });
    }

    // Load immediately if sowhat tab is visible
    if (!document.getElementById('sowhat')?.classList.contains('hidden')) {
      load();
    }

    // Setup polling with Page Visibility optimization
    setupPolling();
  }

  // Boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Expose refresh function
  window.refreshSoWhatEngine = load;
})();
