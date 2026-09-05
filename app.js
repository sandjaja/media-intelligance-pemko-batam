const API_BASE = window.MEDIA_INTELLIGENCE_API || '/api';

/**
 * @typedef {Object} AppState
 * @property {string} tab - Current active tab
 * @property {string} opd - Selected OPD
 * @property {boolean} overpower - Overpower mode toggle
 * @property {Object} metrics - Dashboard metrics
 * @property {Array} articles - All articles
 * @property {Array} highlights - Daily highlights
 * @property {Array} alerts - Alerts list
 * @property {Array} opdList - OPD options
 * @property {Object} health - System health status
 * @property {Array} sources - Media sources
 */
const state = {
  tab: 'dashboard',
  opd: 'all',
  overpower: false,
  metrics: null,
  articles: [],
  highlights: [],
  alerts: [],
  opdList: [],
  health: null,
  sources: []
};

const tabs = [
  ['dashboard', 'gauge-high', 'Dashboard Utama'],
  ['highlights', 'fire', 'Daily News Highlights'],
  ['scan', 'newspaper', 'Scan Media Cetak / OCR'],
  ['sowhat', 'brain', 'So What? Engine'],
  ['sources', 'list-check', 'Daftar Sumber Media'],
  ['alerts', 'triangle-exclamation', 'Alert Management'],
  ['ask', 'comments', 'Ask Intelligence']
];

const $ = id => document.getElementById(id);

/**
 * HTML escape to prevent XSS attacks
 * @param {*} v - Value to escape
 * @returns {string} Escaped string
 */
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[c]));

/**
 * Fetch with timeout, error handling, and credentials
 * @param {string} path - API path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} JSON response
 * @throws {Error} If request fails or times out
 */
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const r = await fetch(API_BASE + path, {
      credentials: 'include',
      signal: controller.signal,
      ...options
    });

    clearTimeout(timeout);

    // Check if unauthorized - redirect to login
    if (r.status === 401) {
      clearSession();
      window.location.href = '/';
      return;
    }

    if (!r.ok) {
      try {
        const errorData = await r.json();
        throw new Error(errorData.error || `HTTP ${r.status}: ${r.statusText}`);
      } catch (parseError) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
    }

    return await r.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout (30s)');
    }
    throw error;
  }
}

/**
 * Session management
 */
const session = {
  token: localStorage.getItem('auth_token'),
  user: JSON.parse(localStorage.getItem('auth_user') || 'null'),

  set(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  },

  clear() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('session_expires');
  },

  isValid() {
    if (!this.token || !this.user) return false;
    const expires = localStorage.getItem('session_expires');
    if (!expires) return true;
    return new Date() < new Date(expires);
  }
};

/**
 * Clear session and redirect to login
 */
function clearSession() {
  session.clear();
  window.location.href = '/';
}

/**
 * Show toast notification
 * @param {string} msg - Message to show
 */
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.add('hidden'), 3500);
}

/**
 * Render navigation tabs
 */
function renderTabs() {
  const tabsEl = $('tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = tabs.map(t => `
    <button data-tab="${t[0]}" class="tab px-3 py-2 rounded-lg border border-transparent text-xs text-slate-400 hover:text-white ${state.tab === t[0] ? 'active bg-slate-800 text-white' : ''}">
      <i class="fa-solid fa-${t[1]} mr-1"></i>${t[2]}
    </button>
  `).join('');
  
  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => showTab(btn.dataset.tab);
  });
}

/**
 * Show specific tab
 * @param {string} id - Tab ID to show
 */
function showTab(id) {
  state.tab = id;
  document.querySelectorAll('main section').forEach(s => s.classList.add('hidden'));
  const section = $(id);
  if (section) section.classList.remove('hidden');
  renderTabs();
  if (id === 'dashboard') drawChart();
}

/**
 * Get risk badge HTML
 * @param {string} level - Risk level
 * @returns {string} Badge HTML
 */
function riskBadge(level = 'low') {
  const map = {
    critical: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  };
  return `<span class="inline-block px-2 py-1 rounded-md text-xs font-semibold border ${map[level] || map.low}">
    ${level.toUpperCase()}
  </span>`;
}

/**
 * Create card HTML
 * @param {string} title - Card title
 * @param {*} value - Main value
 * @param {string} sub - Subtitle
 * @param {string} icon - Font Awesome icon
 * @returns {string} Card HTML
 */
function card(title, value, sub, icon) {
  return `<div class="glass rounded-xl p-4">
    <div class="flex justify-between">
      <div>
        <p class="text-xs text-slate-400">${esc(title)}</p>
        <h3 class="text-2xl font-black mt-1">${esc(String(value))}</h3>
        <p class="text-xs text-slate-500 mt-1">${esc(sub)}</p>
      </div>
      <i class="fa-solid fa-${icon} text-3xl text-slate-600"></i>
    </div>
  </div>`;
}

/**
 * Determine health state
 * @returns {[string, string]} Status label and CSS class
 */
function healthState() {
  const h = state.health?.status || {};
  if ((h.failed_feeds || 0) > 0) return ['FAILED', 'bg-rose-500/10 border-rose-500/30 text-rose-300'];
  if ((h.feed_sources || 0) > 0 && (h.healthy_feeds || 0) < (h.feed_sources || 1)) {
    return ['DEGRADED', 'bg-amber-500/10 border-amber-500/30 text-amber-300'];
  }
  return ['HEALTHY', 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'];
}

/**
 * Render health panel
 */
function renderHealthPanel() {
  const [label, cls] = healthState();
  const h = state.health?.status || {};
  const last = h.last_success_at ? new Date(h.last_success_at).toLocaleString('id-ID') : 'Belum pernah sukses';

  return `<div class="rounded-xl border ${cls} p-4 text-sm">
    <b>System Health: ${label}</b>
    <div class="text-xs text-slate-400 mt-2">
      <div>Feeds: ${h.healthy_feeds || 0}/${h.feed_sources || 0} healthy</div>
      <div>Last success: ${esc(last)}</div>
    </div>
  </div>`;
}

/**
 * Get alert action buttons HTML
 * @param {Object} a - Alert object
 * @returns {string} Action buttons HTML
 */
function alertActions(a) {
  return `<div class="flex gap-2 mt-2">
    <button data-alert-action="acknowledged" data-alert-id="${esc(a.id)}" class="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-xs text-amber-300 hover:bg-amber-500/20">
      Acknowledge
    </button>
    <button data-alert-action="escalated" data-alert-id="${esc(a.id)}" class="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/40 text-xs text-rose-300 hover:bg-rose-500/20">
      Escalate
    </button>
    <button data-alert-action="resolved" data-alert-id="${esc(a.id)}" class="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/40 text-xs text-emerald-300 hover:bg-emerald-500/20">
      Resolve
    </button>
  </div>`;
}

/**
 * Update alert status
 * @param {string} id - Alert ID
 * @param {string} status - New status
 */
async function updateAlert(id, status) {
  try {
    await api(`/alerts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    toast(`Alert ${esc(id)} - Status: ${esc(status)}`);
    await load();
  } catch (e) {
    toast(`Gagal update alert: ${esc(e.message)}`);
  }
}

/**
 * Bind alert action buttons
 */
function bindAlertActions() {
  document.querySelectorAll('[data-alert-action]').forEach(b => {
    b.onclick = () => updateAlert(b.dataset.alertId, b.dataset.alertAction);
  });
}

/**
 * Render dashboard
 */
function renderDashboard() {
  const m = state.metrics || {};
  const news = state.highlights.length ? state.highlights : state.articles.slice(0, 5);
  const h = state.health?.status || {};

  const dashboardEl = $('dashboard');
  if (!dashboardEl) return;

  dashboardEl.innerHTML = `<div class="space-y-6">
    <div>
      <h2 class="text-2xl font-bold mb-4">Dashboard Utama</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        ${card('Total Articles', m.total_articles || 0, 'all time', 'newspaper')}
        ${card('Critical Alerts', m.critical_alerts || 0, 'requires action', 'triangle-exclamation')}
        ${card('Media Sources', m.media_sources || 0, 'active feeds', 'wifi')}
        ${card('Avg Risk Score', Math.round(m.avg_risk_score || 0), 'last 24h', 'gauge-high')}
      </div>
    </div>

    <div>${renderHealthPanel()}</div>

    <div class="glass rounded-2xl p-6">
      <h3 class="text-xl font-bold mb-4">Trend (6 hari terakhir)</h3>
      <div class="relative h-64">
        <canvas id="trend"></canvas>
      </div>
    </div>

    <div class="glass rounded-2xl p-6">
      <h3 class="text-xl font-bold mb-4">Recent News</h3>
      <div class="space-y-3">
        ${news.map(n => `
          <div class="border border-slate-700 rounded-lg p-3 hover:border-slate-500 transition">
            <p class="text-sm font-semibold">${esc(n.headline || 'No headline')}</p>
            <p class="text-xs text-slate-400 mt-1">${esc(n.source_name || 'Unknown')} · ${n.published_at ? new Date(n.published_at).toLocaleString('id-ID') : 'N/A'}</p>
            ${riskBadge(n.risk_level || 'low')}
          </div>
        `).join('')}
      </div>
    </div>

    <div id="alertsPanel" class="glass rounded-2xl p-6">
      <h3 class="text-xl font-bold mb-4">Active Alerts</h3>
      <div id="alertsList" class="space-y-3"></div>
    </div>
  </div>`;

  // Render alerts
  const alertsList = $('alertsList');
  if (alertsList && state.alerts.length > 0) {
    alertsList.innerHTML = state.alerts.slice(0, 5).map(a => `
      <div class="border border-rose-500/30 rounded-lg p-3 bg-rose-500/5">
        <p class="text-sm font-semibold text-rose-300">${esc(a.title || 'Alert')}</p>
        <p class="text-xs text-slate-400 mt-1">${esc(a.description || '')}</p>
        ${alertActions(a)}
      </div>
    `).join('');
    bindAlertActions();
  } else if (alertsList) {
    alertsList.innerHTML = '<p class="text-xs text-slate-500">No active alerts</p>';
  }
}

/**
 * Draw trend chart
 */
function drawChart() {
  setTimeout(() => {
    const c = $('trend');
    if (!c) return;

    // Clean up old chart instance
    if (window._chart) {
      window._chart.destroy();
      window._chart = null;
    }

    window._chart = new Chart(c, {
      type: 'line',
      data: {
        labels: ['-6', '-5', '-4', '-3', '-2', '-1', 'Hari ini'],
        datasets: [
          {
            label: 'Risk Score Trend',
            data: [35, 42, 38, 51, 48, 55, 62],
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#f97316'
          },
          {
            label: 'Articles Count',
            data: [12, 15, 18, 22, 25, 28, 32],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1',
            pointRadius: 4,
            pointBackgroundColor: '#06b6d4'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8', usePointStyle: true } }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Risk Score', color: '#94a3b8' },
            ticks: { color: '#64748b' },
            grid: { color: 'rgba(100, 116, 139, 0.1)' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Article Count', color: '#94a3b8' },
            ticks: { color: '#64748b' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }, 0);
}

/**
 * Render highlights section
 */
function renderHighlights() {
  const news = state.highlights.length ? state.highlights : state.articles;
  const el = $('highlights');
  if (!el) return;

  el.innerHTML = `<div class="space-y-4">
    <h2 class="text-2xl font-bold"><i class="fa-solid fa-fire text-amber-400 mr-2"></i>Daily News Highlights</h2>
    <div class="grid gap-4">
      ${news.slice(0, 10).map(n => `
        <div class="glass rounded-xl p-4 border border-amber-500/20 hover:border-amber-500/40 transition">
          <div class="flex justify-between items-start gap-3">
            <div class="flex-1">
              <h3 class="font-bold text-amber-300">${esc(n.headline || 'N/A')}</h3>
              <p class="text-sm text-slate-400 mt-2">${esc(n.content || '').substring(0, 150)}...</p>
              <div class="flex gap-2 mt-3 flex-wrap">
                ${riskBadge(n.risk_level || 'low')}
                <span class="text-xs text-slate-500">${esc(n.source_name || 'Unknown')}</span>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

/**
 * Render media scan section
 */
function renderScan() {
  const el = $('scan');
  if (!el) return;

  el.innerHTML = `<div class="glass rounded-2xl p-5">
    <h2 class="text-xl font-bold"><i class="fa-solid fa-newspaper text-emerald-400 mr-2"></i>Scan Media Cetak / OCR</h2>
    <p class="text-slate-400 mt-3">Upload file PDF atau gambar media cetak untuk OCR scanning...</p>
    <div class="mt-4">
      <input type="file" id="scanFile" accept=".pdf,.jpg,.jpeg,.png" class="hidden">
      <button id="scanBtn" class="px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg hover:bg-emerald-500/30">
        <i class="fa-solid fa-upload mr-2"></i>Upload File
      </button>
    </div>
  </div>`;

  $('scanBtn')?.addEventListener('click', () => $('scanFile')?.click());
}

/**
 * Render So What Engine section (delegated to sowhat-engine.js)
 */
function renderSoWhat() {
  const el = $('sowhat');
  if (!el) return;
  el.innerHTML = `<div class="glass rounded-2xl p-5 text-center text-slate-400">
    <i class="fa-solid fa-brain text-purple-400 text-3xl"></i>
    <p class="mt-3">Loading So What Engine...</p>
  </div>`;
}

/**
 * Render sources section
 */
function renderSources() {
  const src = state.sources || [];
  const el = $('sources');
  if (!el) return;

  el.innerHTML = `<div class="glass rounded-2xl p-5">
    <h2 class="text-xl font-bold"><i class="fa-solid fa-list-check text-cyan-400 mr-2"></i>Daftar Sumber Media</h2>
    <div class="mt-4 space-y-2">
      ${src.length > 0 ? src.map(s => `
        <div class="flex justify-between items-center p-3 border border-slate-700 rounded-lg">
          <span class="text-sm">${esc(s.name || 'Unknown')}</span>
          <span class="text-xs px-2 py-1 rounded ${s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}">
            ${esc(s.status || 'unknown')}
          </span>
        </div>
      `).join('') : '<p class="text-slate-500 text-sm">No sources available</p>'}
    </div>
  </div>`;
}

/**
 * Render ask intelligence section
 */
function renderAsk() {
  const el = $('ask');
  if (!el) return;

  el.innerHTML = `<div class="glass rounded-2xl p-5">
    <h2 class="text-xl font-bold"><i class="fa-solid fa-comments text-cyan-400 mr-2"></i>Ask Intelligence</h2>
    <p class="text-slate-400 mt-3">Ask questions about media trends and insights...</p>
    <div class="mt-4">
      <input type="text" id="askInput" placeholder="Tanya tentang media intelligence..." class="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500">
      <button id="askBtn" class="mt-2 px-4 py-2 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 rounded-lg hover:bg-cyan-500/30">
        <i class="fa-solid fa-paper-plane mr-2"></i>Ask
      </button>
    </div>
  </div>`;
}

/**
 * Render alerts section
 */
function renderAlerts() {
  const el = $('alerts');
  if (!el) return;

  el.innerHTML = `<div class="space-y-4">
    <h2 class="text-2xl font-bold"><i class="fa-solid fa-triangle-exclamation text-rose-400 mr-2"></i>Alert Management</h2>
    <div id="alertsContainer" class="space-y-3">
      ${state.alerts.length > 0 ? state.alerts.map(a => `
        <div class="glass rounded-xl p-4 border border-rose-500/30">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <h3 class="font-bold text-rose-300">${esc(a.title || 'Alert')}</h3>
              <p class="text-sm text-slate-400 mt-1">${esc(a.description || '')}</p>
              <p class="text-xs text-slate-500 mt-2">Status: ${esc(a.status || 'open')}</p>
            </div>
            <span class="px-2 py-1 rounded text-xs bg-rose-500/20 text-rose-300">${esc(a.level || 'info')}</span>
          </div>
          ${alertActions(a)}
        </div>
      `).join('') : '<p class="text-slate-500">No alerts</p>'}
    </div>
  </div>`;

  bindAlertActions();
}

/**
 * Run media ingestion
 */
async function runIngestion() {
  const b = $('runIngestion');
  if (b) {
    b.disabled = true;
    b.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Monitoring...';
  }

  try {
    const r = await api('/ingestion/run', { method: 'POST' });
    toast(`Ingestion started: ${esc(r.message || 'OK')}`);
    setTimeout(() => load(), 2000);
  } catch (e) {
    toast(`Ingestion failed: ${esc(e.message)}`);
  } finally {
    if (b) {
      b.disabled = false;
      b.innerHTML = '<i class="fa-solid fa-play mr-1"></i>Run Ingestion';
    }
  }
}

/**
 * Loading state management
 */
let loadingPromise = null;

/**
 * Load all data from API
 */
async function load() {
  // Prevent concurrent loads (race condition fix)
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  loadingPromise = (async () => {
    try {
      const opdSelect = $('opdSelect');
      if (opdSelect) opdSelect.disabled = true;

      const qs = state.opd && state.opd !== 'all' ? `?opdId=${encodeURIComponent(state.opd)}` : '';

      const [opd, metrics, articles, highlights, alerts, health, sources] = await Promise.all([
        api('/opd').catch(() => ({ data: [] })),
        api('/metrics').catch(() => ({})),
        api(`/articles${qs}`).catch(() => ({ data: [] })),
        api('/highlights').catch(() => ({ data: [] })),
        api('/alerts').catch(() => ({ data: [] })),
        api('/health').catch(() => ({})),
        api('/sources').catch(() => ({ data: [] }))
      ]);

      state.opdList = Array.isArray(opd?.data) ? opd.data : [];
      state.metrics = metrics;
      state.articles = Array.isArray(articles?.data) ? articles.data : [];
      state.highlights = Array.isArray(highlights?.data) ? highlights.data : [];
      state.alerts = Array.isArray(alerts?.data) ? alerts.data : [];
      state.health = health;
      state.sources = Array.isArray(sources?.data) ? sources.data : [];

      renderDashboard();
      renderHighlights();
      renderAlerts();
      renderSources();
      renderScan();
      renderAsk();
      renderSoWhat();

      toast('Data loaded successfully');
    } catch (e) {
      toast(`Load failed: ${esc(e.message)}`);
      console.error('Load error:', e);
    } finally {
      const opdSelect = $('opdSelect');
      if (opdSelect) opdSelect.disabled = false;
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Render user profile header
 */
function renderUserHeader() {
  const header = $('userHeader');
  if (!header || !session.user) return;

  header.innerHTML = `
    <div class="flex items-center gap-4">
      <div class="text-right">
        <p class="font-semibold text-white">${esc(session.user.name || 'User')}</p>
        <p class="text-xs text-slate-400">${esc(session.user.role || 'Admin')}</p>
      </div>
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold">
        ${esc((session.user.name || 'U').charAt(0).toUpperCase())}
      </div>
      <button id="logoutBtn" class="px-3 py-1 rounded text-xs bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30">
        <i class="fa-solid fa-sign-out-alt mr-1"></i>Logout
      </button>
    </div>
  `;

  $('logoutBtn')?.addEventListener('click', logout);
}

/**
 * Logout user
 */
async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (e) {
    console.warn('Logout error:', e);
  } finally {
    clearSession();
  }
}

/**
 * Initialize application
 */
async function init() {
  try {
    // Check session validity
    if (!session.isValid()) {
      clearSession();
      return;
    }

    renderUserHeader();

    // Load OPD list
    const opd = await api('/opd').catch(() => ({ data: [] }));
    state.opdList = Array.isArray(opd?.data) ? opd.data : [];

    const opdSelect = $('opdSelect');
    if (opdSelect) {
      opdSelect.innerHTML = '<option value="all">Semua OPD / Pemko Batam</option>' +
        state.opdList.map(o => `<option value="${esc(o.id || o)}">${esc(o.name || o)}</option>`).join('');

      // Debounced OPD change handler
      const debouncedLoad = debounce(() => load(), 300);
      opdSelect.onchange = (e) => {
        state.opd = e.target.value;
        debouncedLoad();
      };
    }

    // Mode button
    const modeBtn = $('modeBtn');
    if (modeBtn) {
      modeBtn.onclick = () => {
        state.overpower = !state.overpower;
        modeBtn.classList.toggle('active', state.overpower);
        renderTabs();
      };
    }

    // Ingestion button
    const ingestBtn = $('runIngestion');
    if (ingestBtn) {
      ingestBtn.onclick = runIngestion;
    }

    renderTabs();
    await load();
  } catch (e) {
    toast(`Init failed: ${esc(e.message)}`);
    console.error('Init error:', e);
  }
}

/**
 * Debounce utility function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Debounce delay in ms
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

// Expose functions for external use
window.showTab = showTab;
window.load = load;
window.debounce = debounce;
window.logout = logout;
