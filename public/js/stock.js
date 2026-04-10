import { api, fmtPrice, fmtPct, fmtChange, fmtLarge, fmtVol, relTime, changeClass, chartDefaults, initSearch } from './api.js';

initSearch(document.getElementById('searchInput'), document.getElementById('searchDropdown'));

const params  = new URLSearchParams(location.search);
const SYMBOL  = (params.get('symbol') || 'AAPL').toUpperCase();

let priceChart = null;
let volChart   = null;
let currentPrice = null;
let stockName  = '';

document.getElementById('breadSymbol').textContent = SYMBOL;
document.title = `${SYMBOL} — StockPulse`;

/* ── Load quote + summary ───────────────────────────────────── */
async function loadStock() {
  try {
    const { quote, summary } = await api.stock(SYMBOL);
    currentPrice = quote.price;
    stockName    = quote.name;

    document.getElementById('symbolLabel').textContent   = SYMBOL;
    document.getElementById('nameLabel').textContent     = quote.name || SYMBOL;
    document.getElementById('priceLabel').textContent    = quote.price?.toFixed(2) ?? '—';
    document.getElementById('exchangeLabel').textContent = quote.currency ? `${quote.currency}` : '';

    const chgCls = changeClass(quote.changePct);
    document.getElementById('changeLabel').innerHTML =
      `<span class="${chgCls}">${fmtChange(quote.change)} (${fmtPct(quote.changePct)})</span>`;

    document.getElementById('modalSymbol').textContent = `${quote.name || SYMBOL} (${SYMBOL})`;
    document.getElementById('modalPrice').textContent  = quote.price?.toFixed(2) ?? '';
    document.getElementById('buyPriceInput').value     = quote.price?.toFixed(2) ?? '';
    document.getElementById('buyDateInput').valueAsDate = new Date();

    renderStats(quote);
    renderAbout(summary);
    renderAnalyst(summary);
    renderFinancials(quote, summary);
  } catch (e) {
    document.getElementById('symbolLabel').textContent = 'Error loading stock';
  }
}

/* ── Stats grid ──────────────────────────────────────────────── */
function stat(label, value) {
  return `<div class="stat-item"><div class="stat-label">${label}</div><div class="stat-value">${value ?? '—'}</div></div>`;
}

function renderStats(q) {
  const w52Pos = (q.week52High && q.week52Low && q.price)
    ? ((q.price - q.week52Low) / (q.week52High - q.week52Low) * 100).toFixed(0) + '%'
    : null;

  document.getElementById('statsGrid').innerHTML = [
    stat('Market Cap',   fmtLarge(q.mktCap)),
    stat('P/E Ratio',    q.pe?.toFixed(2) ?? '—'),
    stat('EPS (TTM)',    q.eps?.toFixed(2) ?? '—'),
    stat('Volume',       fmtVol(q.volume)),
    stat('Avg Volume',   fmtVol(q.avgVolume)),
    stat('Open',         q.open?.toFixed(2) ?? '—'),
    stat('Day High',     q.high?.toFixed(2) ?? '—'),
    stat('Day Low',      q.low?.toFixed(2) ?? '—'),
    stat('52W High',     q.week52High?.toFixed(2) ?? '—'),
    stat('52W Low',      q.week52Low?.toFixed(2) ?? '—'),
    stat('52W Position', w52Pos ?? '—'),
    stat('Currency',     q.currency ?? '—'),
  ].join('');
}

/* ── About ────────────────────────────────────────────────────── */
function renderAbout(summary) {
  const profile = summary?.summaryProfile;
  if (!profile) return;
  document.getElementById('aboutText').textContent = profile.longBusinessSummary?.slice(0, 500) + '…' || '—';
  const meta = [
    ['Sector',    profile.sector],
    ['Industry',  profile.industry],
    ['Employees', profile.fullTimeEmployees?.toLocaleString()],
    ['HQ',        profile.city && profile.country ? `${profile.city}, ${profile.country}` : null],
  ].filter(([, v]) => v);
  document.getElementById('aboutMeta').innerHTML = meta.map(([k, v]) =>
    `<div style="font-size:0.78rem"><span style="color:var(--text3)">${k}:</span> <span style="color:var(--text1)">${v}</span></div>`
  ).join('');
}

/* ── Analyst Recommendations ──────────────────────────────────── */
function renderAnalyst(summary) {
  const fin = summary?.financialData;
  const trend = summary?.recommendationTrend?.trend?.[0];
  const el = document.getElementById('analystSummary');
  if (!fin && !trend) { el.innerHTML = '<div class="empty-state" style="padding:0.5rem">No analyst data available.</div>'; return; }

  const rec    = fin?.recommendationKey || 'none';
  const target = fin?.targetMeanPrice;
  const strongBuy = trend?.strongBuy || 0;
  const buy       = trend?.buy       || 0;
  const hold      = trend?.hold      || 0;
  const sell      = trend?.sell      || 0;
  const strongSell = trend?.strongSell || 0;
  const total = strongBuy + buy + hold + sell + strongSell || 1;

  const upside = target && currentPrice ? ((target - currentPrice) / currentPrice * 100) : null;

  const recLabel = { strongbuy: 'Strong Buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strongsell: 'Strong Sell' };
  const recColor = { strongbuy: 'var(--green)', buy: 'var(--green)', hold: 'var(--yellow)', sell: 'var(--red)', strongsell: 'var(--red)' };

  el.innerHTML = `
    <div class="analyst-score">
      <div class="analyst-score__num" style="color:${recColor[rec] || 'var(--text2)'}">
        ${recLabel[rec] || rec}
      </div>
      <div class="analyst-score__label">Consensus</div>
      ${target ? `<div style="margin-top:6px;font-family:monospace;font-size:0.875rem;color:var(--text1)">Target: $${target.toFixed(2)}</div>` : ''}
      ${upside != null ? `<div style="font-family:monospace;font-size:0.78rem;color:${upside >= 0 ? 'var(--green)' : 'var(--red)'}">${upside >= 0 ? '▲' : '▼'} ${Math.abs(upside).toFixed(1)}% upside</div>` : ''}
    </div>
    <div class="analyst-breakdown">
      ${[
        ['Strong Buy',  strongBuy,  'var(--green)'],
        ['Buy',         buy,        '#7ed957'],
        ['Hold',        hold,       'var(--yellow)'],
        ['Sell',        sell,       '#f87060'],
        ['Strong Sell', strongSell, 'var(--red)'],
      ].map(([label, count, color]) => `
        <div class="analyst-row">
          <span class="analyst-row__label">${label}</span>
          <div class="analyst-row__bar-wrap">
            <div class="analyst-row__bar" style="width:${(count/total*100).toFixed(0)}%;background:${color}"></div>
          </div>
          <span class="analyst-row__count">${count}</span>
        </div>`).join('')}
    </div>`;
}

/* ── Financials sidebar ───────────────────────────────────────── */
function renderFinancials(quote, summary) {
  const fin = summary?.financialData;
  const stats = summary?.defaultKeyStatistics;
  const rows = [
    ['Revenue (TTM)',       fin?.totalRevenue ? fmtLarge(fin.totalRevenue) : null],
    ['Gross Profit',       fin?.grossProfits ? fmtLarge(fin.grossProfits) : null],
    ['EBITDA',             fin?.ebitda ? fmtLarge(fin.ebitda) : null],
    ['Profit Margin',      fin?.profitMargins ? fmtPct(fin.profitMargins * 100) : null],
    ['Revenue Growth',     fin?.revenueGrowth ? fmtPct(fin.revenueGrowth * 100) : null],
    ['Return on Equity',   fin?.returnOnEquity ? fmtPct(fin.returnOnEquity * 100) : null],
    ['Debt/Equity',        fin?.debtToEquity?.toFixed(2) ?? null],
    ['Current Ratio',      fin?.currentRatio?.toFixed(2) ?? null],
    ['Beta',               stats?.beta?.toFixed(2) ?? null],
    ['Forward P/E',        stats?.forwardPE?.toFixed(2) ?? null],
    ['PEG Ratio',          stats?.pegRatio?.toFixed(2) ?? null],
    ['Price/Book',         stats?.priceToBook?.toFixed(2) ?? null],
    ['Shares Outstanding', stats?.sharesOutstanding ? fmtLarge(stats.sharesOutstanding) : null],
    ['Float',              stats?.floatShares ? fmtLarge(stats.floatShares) : null],
    ['Dividend Yield',     stats?.yield ? fmtPct(stats.yield * 100) : null],
  ].filter(([, v]) => v);

  const el = document.getElementById('financialsGrid');
  if (!rows.length) { el.innerHTML = '<div class="empty-state" style="padding:0.5rem">No financial data.</div>'; return; }
  el.innerHTML = rows.map(([k, v]) => `
    <div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border2);font-size:0.82rem">
      <span style="color:var(--text2)">${k}</span>
      <span style="font-family:monospace;color:var(--text0)">${v}</span>
    </div>`).join('');
}

/* ── Price Chart ──────────────────────────────────────────────── */
async function loadChart(period = '1mo') {
  try {
    const data = await api.history(SYMBOL, period);
    if (!data.length) return;

    const labels = data.map(d => {
      const date = new Date(d.date);
      return period === '1d' || period === '5d'
        ? date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const prices  = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const isUp    = prices[prices.length - 1] >= prices[0];
    const lineColor = isUp ? '#3fb950' : '#f85149';
    const fillColor = isUp ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)';

    /* Price chart */
    const pCtx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(pCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: prices,
          borderColor: lineColor,
          backgroundColor: fillColor,
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.2,
        }],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          ...chartDefaults().plugins,
          tooltip: {
            ...chartDefaults().plugins.tooltip,
            callbacks: {
              label: ctx => `$${ctx.parsed.y.toFixed(2)}`,
            },
          },
        },
      },
    });

    /* Volume chart */
    const vCtx = document.getElementById('volChart').getContext('2d');
    if (volChart) volChart.destroy();
    volChart = new Chart(vCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: volumes,
          backgroundColor: 'rgba(88,166,255,0.3)',
          borderWidth: 0,
        }],
      },
      options: {
        ...chartDefaults(),
        scales: {
          x: { display: false },
          y: {
            position: 'right',
            grid: { display: false },
            ticks: { color: '#656d76', font: { size: 10 }, callback: v => fmtVol(v) },
          },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });

  } catch (e) { /* silent */ }
}

/* ── Period buttons ───────────────────────────────────────────── */
document.getElementById('periodBtns').addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadChart(btn.dataset.period);
});

/* ── Stock news ───────────────────────────────────────────────── */
async function loadStockNews() {
  try {
    const items = await api.stockNews(SYMBOL);
    document.getElementById('stockNewsList').innerHTML = items.map(n => `
      <div class="news-item">
        ${n.thumbnail ? `<img class="news-item__thumb" src="${n.thumbnail}" alt="" loading="lazy" />` : ''}
        <div class="news-item__body">
          <a class="news-item__title" href="${n.link}" target="_blank" rel="noopener">${n.title}</a>
          <div class="news-item__meta">
            <span class="news-source">${n.publisher || ''}</span>
            <span class="news-time">${relTime(n.pubDate)}</span>
          </div>
        </div>
      </div>`).join('') || '<div class="empty-state">No news available.</div>';
  } catch {
    document.getElementById('stockNewsList').innerHTML = '<div class="empty-state">Could not load news.</div>';
  }
}

/* ── Portfolio modal ──────────────────────────────────────────── */
document.getElementById('addToPortfolio').addEventListener('click', () => {
  document.getElementById('portfolioModal').classList.add('show');
});
document.getElementById('cancelModal').addEventListener('click', () => {
  document.getElementById('portfolioModal').classList.remove('show');
});
document.getElementById('portfolioModal').addEventListener('click', e => {
  if (e.target === document.getElementById('portfolioModal'))
    document.getElementById('portfolioModal').classList.remove('show');
});

document.getElementById('confirmAdd').addEventListener('click', () => {
  const price  = parseFloat(document.getElementById('buyPriceInput').value);
  const shares = parseFloat(document.getElementById('sharesInput').value);
  const date   = document.getElementById('buyDateInput').value;
  if (!price || !shares) { alert('Please enter price and shares.'); return; }

  const portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
  const existing  = portfolio.findIndex(h => h.symbol === SYMBOL);
  if (existing >= 0) {
    // average down/up
    const h = portfolio[existing];
    const totalShares = h.shares + shares;
    h.avgPrice = (h.avgPrice * h.shares + price * shares) / totalShares;
    h.shares   = totalShares;
  } else {
    portfolio.push({ symbol: SYMBOL, name: stockName, shares, avgPrice: price, buyDate: date });
  }
  localStorage.setItem('portfolio', JSON.stringify(portfolio));
  document.getElementById('portfolioModal').classList.remove('show');
  alert(`Added ${shares} shares of ${SYMBOL} to your portfolio.`);
});

/* ── Boot ─────────────────────────────────────────────────────── */
loadStock();
loadChart('1mo');
loadStockNews();
