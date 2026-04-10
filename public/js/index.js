import { api, fmtPrice, fmtPct, fmtChange, relTime, changeClass, sectorColor, initSearch } from './api.js';

initSearch(document.getElementById('searchInput'), document.getElementById('searchDropdown'));

/* ── Market time ───────────────────────────────────────────── */
function updateTime() {
  const el = document.getElementById('marketTime');
  const now = new Date();
  const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = nyTime.getHours(), m = nyTime.getMinutes();
  let status = '';
  if (h >= 9 && (h < 16 || (h === 16 && m === 0))) {
    status = '<span style="color:var(--green)">● Market Open</span>';
  } else if ((h >= 4 && h < 9) || (h === 16 && m < 60) || h === 17) {
    status = '<span style="color:var(--yellow)">● Pre/After Hours</span>';
  } else {
    status = '<span style="color:var(--text3)">● Market Closed</span>';
  }
  el.innerHTML = `${status} &nbsp; ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ET`;
}
updateTime();
setInterval(updateTime, 30000);

/* ── Indices ───────────────────────────────────────────────── */
async function loadIndices() {
  try {
    const data = await api.indices();
    const grid = document.getElementById('indicesGrid');
    grid.innerHTML = data.map(idx => {
      const cls = changeClass(idx.changePct);
      return `
        <div class="index-card ${cls}" onclick="location.href='/stock.html?symbol=${encodeURIComponent(idx.symbol)}'">
          <div class="index-card__name">${idx.name}</div>
          <div class="index-card__price mono">${idx.price?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—'}</div>
          <div class="index-card__change">
            <span class="${cls}">${fmtChange(idx.change)}</span>
            <span class="${cls}">${fmtPct(idx.changePct)}</span>
          </div>
        </div>`;
    }).join('');

    buildTicker(data);
  } catch (e) {
    document.getElementById('indicesGrid').innerHTML = '<div class="empty-state">Could not load market data.</div>';
  }
}

/* ── Ticker tape ───────────────────────────────────────────── */
function buildTicker(data) {
  const items = data.map(d => {
    const cls = changeClass(d.changePct);
    return `<div class="ticker__item">
      <span class="ticker__symbol">${d.name}</span>
      <span class="ticker__price">${d.price?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—'}</span>
      <span class="ticker__change ${cls}">${fmtPct(d.changePct)}</span>
    </div>`;
  }).join('');
  // duplicate for seamless loop
  document.getElementById('tickerTrack').innerHTML = items + items;
}

/* ── News ──────────────────────────────────────────────────── */
async function loadNews() {
  try {
    const items = await api.news();
    document.getElementById('newsCount').textContent = `${items.length} stories`;
    document.getElementById('newsList').innerHTML = items.map(n => `
      <div class="news-item">
        <div class="news-item__body">
          <a class="news-item__title" href="${n.link}" target="_blank" rel="noopener">${n.title}</a>
          <div class="news-item__meta">
            <span class="news-source ${n.source?.toLowerCase().replace(/\s/g,'')}">${n.source}</span>
            <span class="news-time">${relTime(n.pubDate)}</span>
            ${n.summary ? `<span style="font-size:0.72rem;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px">${n.summary.slice(0,80)}…</span>` : ''}
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    document.getElementById('newsList').innerHTML = '<div class="empty-state">Could not load news feeds.</div>';
  }
}

/* ── Movers ────────────────────────────────────────────────── */
async function loadMovers(type) {
  const el = document.getElementById('moversList');
  el.innerHTML = '<div class="loading-rows"><div class="skeleton loading-row"></div><div class="skeleton loading-row"></div></div>';
  try {
    const data = await api.movers(type);
    el.innerHTML = data.map(s => {
      const cls = changeClass(s?.changePct);
      return `
        <div class="mover-row" onclick="location.href='/stock.html?symbol=${encodeURIComponent(s.symbol)}'">
          <div>
            <div class="mover-symbol">${s.symbol}</div>
            <div class="mover-name">${s.name || ''}</div>
          </div>
          <div class="mover-price mono">${s.price?.toFixed(2) ?? '—'}</div>
          <div class="mover-pct ${cls}">${fmtPct(s.changePct)}</div>
        </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div class="empty-state">No data.</div>';
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadMovers(btn.dataset.type);
  });
});

/* ── Sectors ───────────────────────────────────────────────── */
async function loadSectors() {
  try {
    const data = await api.sectors();
    document.getElementById('sectorGrid').innerHTML = data.map(s => {
      const bg = sectorColor(s.changePct);
      return `
        <div class="sector-cell" style="background:${bg}" onclick="location.href='/screener.html'">
          <div class="sector-cell__name">${s.name}</div>
          <div class="sector-cell__pct">${s.changePct != null ? fmtPct(s.changePct) : '—'}</div>
        </div>`;
    }).join('');
  } catch {
    document.getElementById('sectorGrid').innerHTML = '';
  }
}

/* ── Recommendations ────────────────────────────────────────── */
async function loadRecs() {
  try {
    const data = await api.recommendations();
    const top = data
      .filter(r => r.recommendation?.includes('buy') || r.recommendation?.includes('Buy'))
      .sort((a, b) => (b.upside ?? 0) - (a.upside ?? 0))
      .slice(0, 8);

    document.getElementById('recGrid').innerHTML = top.map(r => {
      const total = (r.analystBuy || 0) + (r.analystHold || 0) + (r.analystSell || 0) || 1;
      const buyW  = ((r.analystBuy  || 0) / total * 100).toFixed(1);
      const holdW = ((r.analystHold || 0) / total * 100).toFixed(1);
      const sellW = ((r.analystSell || 0) / total * 100).toFixed(1);
      const recKey = (r.recommendation || '').replace(' ', '').toLowerCase();
      const cls = changeClass(r.changePct);
      return `
        <div class="rec-card" onclick="location.href='/stock.html?symbol=${encodeURIComponent(r.symbol)}'">
          <div class="rec-card__top">
            <span class="rec-card__symbol">${r.symbol}</span>
            <span class="rec-badge ${recKey}">${r.recommendation}</span>
          </div>
          <div class="rec-card__name">${r.name}</div>
          <div class="rec-card__price mono">${r.price?.toFixed(2) ?? '—'}
            <span class="${cls}" style="font-size:0.78rem">${fmtPct(r.changePct)}</span>
          </div>
          <div class="rec-card__meta">
            ${r.upside != null ? `<span class="rec-card__upside">▲ ${r.upside.toFixed(1)}% upside</span>` : '<span></span>'}
            <span class="rec-card__analysts">${r.analystBuy} buy / ${r.analystHold} hold</span>
          </div>
          <div class="analyst-bar">
            <div class="analyst-bar__buy"  style="flex:${buyW}"></div>
            <div class="analyst-bar__hold" style="flex:${holdW}"></div>
            <div class="analyst-bar__sell" style="flex:${sellW}"></div>
          </div>
        </div>`;
    }).join('') || '<div class="empty-state">No recommendations available.</div>';
  } catch {
    document.getElementById('recGrid').innerHTML = '<div class="empty-state">Could not load recommendations.</div>';
  }
}

/* ── Boot ──────────────────────────────────────────────────── */
loadIndices();
loadNews();
loadMovers('active');
loadSectors();
loadRecs();

// Refresh indices every 60s
setInterval(loadIndices, 60000);
