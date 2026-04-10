/* Shared API client — all fetch calls go through here */

const BASE = '';   // same origin

async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  indices:         ()             => apiFetch('/api/market/indices'),
  movers:          (type)         => apiFetch(`/api/market/movers?type=${type}`),
  sectors:         ()             => apiFetch('/api/market/sectors'),
  news:            ()             => apiFetch('/api/news'),
  search:          (q)            => apiFetch(`/api/search?q=${encodeURIComponent(q)}`),
  stock:           (sym)          => apiFetch(`/api/stock/${sym}`),
  history:         (sym, period)  => apiFetch(`/api/stock/${sym}/history?period=${period}`),
  stockNews:       (sym)          => apiFetch(`/api/stock/${sym}/news`),
  screener:        (screen, count) => apiFetch(`/api/screener?screen=${screen}&count=${count || 25}`),
  recommendations: ()             => apiFetch('/api/recommendations'),
  quotes:          (symbols)      => apiFetch('/api/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols }),
  }),
};

/* ── Formatting helpers ───────────────────────────────────── */

export function fmtPrice(n, currency = 'USD') {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

export function fmtChange(n) {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}`;
}

export function fmtPct(n) {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtLarge(n) {
  if (n == null) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export function fmtVol(n) {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export function relTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function changeClass(n) {
  if (n == null) return 'flat';
  return n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
}

export function sectorColor(pct) {
  if (pct == null) return '#21262d';
  const intensity = Math.min(Math.abs(pct) / 3, 1);
  if (pct > 0) {
    const g = Math.round(60 + intensity * 130);
    return `rgb(20, ${g}, 40)`;
  } else {
    const r = Math.round(80 + intensity * 130);
    return `rgb(${r}, 20, 20)`;
  }
}

/* ── Nav search wiring (shared across pages) ──────────────── */

export function initSearch(inputEl, dropdownEl) {
  let timer;
  inputEl.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inputEl.value.trim();
    if (q.length < 1) { dropdownEl.classList.remove('show'); return; }
    timer = setTimeout(async () => {
      try {
        const results = await api.search(q);
        dropdownEl.innerHTML = results.length
          ? results.map(r => `
              <div class="search-result" data-symbol="${r.symbol}">
                <div>
                  <div class="search-result__symbol">${r.symbol}</div>
                  <div class="search-result__name">${r.name || ''}</div>
                </div>
                <span class="search-result__type">${r.type || ''}</span>
              </div>`).join('')
          : '<div class="search-result"><div class="search-result__name" style="color:var(--text3)">No results</div></div>';
        dropdownEl.classList.add('show');
      } catch { /* silent */ }
    }, 280);
  });

  dropdownEl.addEventListener('click', e => {
    const row = e.target.closest('.search-result[data-symbol]');
    if (row) {
      window.location.href = `/stock.html?symbol=${row.dataset.symbol}`;
    }
  });

  document.addEventListener('click', e => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
      dropdownEl.classList.remove('show');
    }
  });
}

/* ── Chart.js default config ──────────────────────────────── */

export function chartDefaults() {
  return {
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1c2128',
        borderColor: '#30363d',
        borderWidth: 1,
        titleColor: '#8b949e',
        bodyColor: '#e6edf3',
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { color: '#21262d' },
        ticks: { color: '#656d76', maxTicksLimit: 8, font: { family: 'monospace', size: 11 } },
      },
      y: {
        grid: { color: '#21262d' },
        ticks: { color: '#656d76', font: { family: 'monospace', size: 11 } },
        position: 'right',
      },
    },
    interaction: { mode: 'index', intersect: false },
    animation: { duration: 400 },
    responsive: true,
    maintainAspectRatio: false,
  };
}
