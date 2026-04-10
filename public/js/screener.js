import { api, fmtPct, fmtChange, fmtLarge, fmtVol, changeClass, initSearch } from './api.js';

initSearch(document.getElementById('searchInput'), document.getElementById('searchDropdown'));

let currentData = [];
let sortCol = 'volume';
let sortDir = -1; // -1 = desc, 1 = asc

/* ── Render table ──────────────────────────────────────────── */
function renderTable(data) {
  const tbody = document.getElementById('screenerBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">No results found.</div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(s => {
    const cls = changeClass(s?.changePct);
    const pctBar = s.week52High && s.week52Low && s.price
      ? ((s.price - s.week52Low) / (s.week52High - s.week52Low) * 100).toFixed(0)
      : null;
    return `
      <tr onclick="location.href='/stock.html?symbol=${encodeURIComponent(s.symbol)}'">
        <td class="symbol-cell">${s.symbol}</td>
        <td class="name-cell">${s.name || '—'}</td>
        <td class="num">${s.price?.toFixed(2) ?? '—'}</td>
        <td class="num ${cls}">${fmtPct(s.changePct)}</td>
        <td class="num ${cls}">${fmtChange(s.change)}</td>
        <td class="num">${fmtVol(s.volume)}</td>
        <td class="num">${fmtLarge(s.mktCap)}</td>
        <td class="num">${s.pe?.toFixed(1) ?? '—'}</td>
        <td class="num">${s.week52High?.toFixed(2) ?? '—'}</td>
        <td class="num">${s.week52Low?.toFixed(2) ?? '—'}</td>
      </tr>`;
  }).join('');
}

/* ── Sort ──────────────────────────────────────────────────── */
function sortData(data, col, dir) {
  return [...data].sort((a, b) => {
    const av = a[col] ?? (dir === -1 ? -Infinity : Infinity);
    const bv = b[col] ?? (dir === -1 ? -Infinity : Infinity);
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

document.querySelectorAll('.data-table th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortDir *= -1;
    } else {
      sortCol = col;
      sortDir = -1;
    }
    document.querySelectorAll('.data-table th').forEach(h => h.classList.remove('sorted'));
    th.classList.add('sorted');
    th.textContent = th.textContent.replace(' ▲', '').replace(' ▼', '');
    th.textContent += sortDir === -1 ? ' ▼' : ' ▲';
    renderTable(sortData(currentData, sortCol, sortDir));
  });
});

/* ── Load screen ───────────────────────────────────────────── */
async function loadScreen(screen) {
  document.getElementById('resultCount').textContent = 'Loading…';
  document.getElementById('screenerBody').innerHTML = `
    <tr><td colspan="10">
      <div class="loading-rows" style="padding:1rem">
        <div class="skeleton loading-row"></div>
        <div class="skeleton loading-row"></div>
        <div class="skeleton loading-row"></div>
        <div class="skeleton loading-row"></div>
      </div>
    </td></tr>`;
  try {
    currentData = await api.screener(screen, 30);
    document.getElementById('resultCount').textContent = `${currentData.length} results`;
    renderTable(sortData(currentData, sortCol, sortDir));
  } catch (e) {
    document.getElementById('screenerBody').innerHTML = `
      <tr><td colspan="10"><div class="empty-state">Failed to load screener data. Is the server running?</div></td></tr>`;
    document.getElementById('resultCount').textContent = '';
  }
}

/* ── Screen buttons ────────────────────────────────────────── */
document.getElementById('screenBtns').addEventListener('click', e => {
  const btn = e.target.closest('.screen-btn');
  if (!btn) return;
  document.querySelectorAll('.screen-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadScreen(btn.dataset.screen);
});

/* ── Boot ──────────────────────────────────────────────────── */
loadScreen('most_actives');
