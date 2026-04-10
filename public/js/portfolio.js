import { api, fmtPrice, fmtPct, fmtChange, fmtLarge, changeClass, chartDefaults, initSearch } from './api.js';

initSearch(document.getElementById('searchInput'), document.getElementById('searchDropdown'));

// ── Portfolio storage ─────────────────────────────────────────
function getPortfolio() {
  return JSON.parse(localStorage.getItem('portfolio') || '[]');
}
function savePortfolio(p) {
  localStorage.setItem('portfolio', JSON.stringify(p));
}
function removeHolding(symbol) {
  savePortfolio(getPortfolio().filter(h => h.symbol !== symbol));
  location.reload();
}

// ── Palette for charts ────────────────────────────────────────
const PALETTE = [
  '#58a6ff','#3fb950','#f85149','#d29922','#bc8cff',
  '#ff7b72','#79c0ff','#56d364','#ffa657','#e3b341',
  '#db61a2','#80ccff',
];

// ── Chart instances ───────────────────────────────────────────
let perfChart  = null;
let allocChart = null;

// ── Main render ───────────────────────────────────────────────
async function renderPortfolio() {
  const portfolio = getPortfolio();

  if (!portfolio.length) {
    document.getElementById('emptyState').style.display    = 'block';
    document.getElementById('portfolioContent').style.display = 'none';
    return;
  }

  document.getElementById('emptyState').style.display    = 'none';
  document.getElementById('portfolioContent').style.display = 'block';

  // Fetch live quotes
  let quotes = [];
  try {
    quotes = await api.quotes(portfolio.map(h => h.symbol));
  } catch { /* leave empty — will show with dashes */ }

  const quoteMap = {};
  quotes.forEach(q => { if (q) quoteMap[q.symbol] = q; });

  // Merge portfolio with live data
  const holdings = portfolio.map(h => {
    const q = quoteMap[h.symbol] || {};
    const currentPrice = q.price ?? null;
    const marketValue  = currentPrice != null ? currentPrice * h.shares : null;
    const costBasis    = h.avgPrice * h.shares;
    const gainLoss     = marketValue != null ? marketValue - costBasis : null;
    const returnPct    = costBasis > 0 && gainLoss != null ? (gainLoss / costBasis) * 100 : null;
    const dayChange    = q.changePct ?? null;
    return {
      ...h,
      currentPrice,
      marketValue,
      costBasis,
      gainLoss,
      returnPct,
      dayChange,
      beta: null, // fetched separately for risk
      name: q.name || h.name || h.symbol,
    };
  });

  const totalValue   = holdings.reduce((s, h) => s + (h.marketValue  ?? h.costBasis), 0);
  const totalCost    = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalGain    = totalValue - totalCost;
  const totalRetPct  = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const todayChange  = holdings.reduce((s, h) => {
    if (h.dayChange == null || h.marketValue == null) return s;
    return s + (h.marketValue * h.dayChange / 100);
  }, 0);
  const todayChangePct = totalValue > 0 ? (todayChange / totalValue) * 100 : 0;

  renderSummary(totalValue, totalGain, totalRetPct, todayChange, todayChangePct);
  renderHoldings(holdings, totalValue);
  renderAllocation(holdings, totalValue);
  renderPerformanceChart(holdings, totalValue);
  await renderRisk(holdings, totalValue);
  renderDiversification(holdings);
}

// ── Summary cards ─────────────────────────────────────────────
function renderSummary(totalValue, totalGain, totalRetPct, todayChange, todayChangePct) {
  const gainCls = totalGain >= 0 ? 'up' : 'down';
  const dayCls  = todayChange >= 0 ? 'up' : 'down';
  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="summary-card__label">Total Value</div>
      <div class="summary-card__value">$${totalValue.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Total Gain / Loss</div>
      <div class="summary-card__value ${gainCls}">$${totalGain.toFixed(2)}</div>
      <div class="summary-card__sub ${gainCls}">${fmtPct(totalRetPct)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Today's Change</div>
      <div class="summary-card__value ${dayCls}">$${todayChange.toFixed(2)}</div>
      <div class="summary-card__sub ${dayCls}">${fmtPct(todayChangePct)}</div>
    </div>
    <div class="summary-card">
      <div class="summary-card__label">Positions</div>
      <div class="summary-card__value">${getPortfolio().length}</div>
    </div>`;
}

// ── Holdings table ────────────────────────────────────────────
function renderHoldings(holdings, totalValue) {
  const tbody = document.getElementById('holdingsBody');
  tbody.innerHTML = holdings.map(h => {
    const gainCls = h.gainLoss != null ? changeClass(h.gainLoss) : 'flat';
    const dayCls  = h.dayChange != null ? changeClass(h.dayChange) : 'flat';
    const weight  = totalValue > 0 && h.marketValue != null ? (h.marketValue / totalValue * 100).toFixed(1) : '—';
    return `
      <tr>
        <td class="symbol-cell" style="cursor:pointer" onclick="location.href='/stock.html?symbol=${encodeURIComponent(h.symbol)}'">${h.symbol}</td>
        <td class="name-cell">${h.name}</td>
        <td class="num">${h.shares.toLocaleString()}</td>
        <td class="num mono">$${h.avgPrice.toFixed(2)}</td>
        <td class="num mono">${h.currentPrice != null ? '$' + h.currentPrice.toFixed(2) : '—'}</td>
        <td class="num mono">
          ${h.marketValue != null ? '$' + h.marketValue.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}
          <div style="font-size:0.7rem;color:var(--text3)">${weight}%</div>
        </td>
        <td class="num ${gainCls}">${h.gainLoss != null ? (h.gainLoss >= 0 ? '+' : '') + '$' + h.gainLoss.toFixed(2) : '—'}</td>
        <td class="num ${gainCls}">${h.returnPct != null ? fmtPct(h.returnPct) : '—'}</td>
        <td class="num ${dayCls}">${h.dayChange != null ? fmtPct(h.dayChange) : '—'}</td>
        <td style="text-align:right">
          <button class="btn btn-danger btn-sm" onclick="window.__removeHolding('${h.symbol}')">✕</button>
        </td>
      </tr>`;
  }).join('');
  window.__removeHolding = removeHolding;
}

// ── Performance bar chart ─────────────────────────────────────
function renderPerformanceChart(holdings, totalValue) {
  const labels = holdings.map(h => h.symbol);
  const returns = holdings.map(h => h.returnPct ?? 0);
  const colors  = returns.map(r => r >= 0 ? 'rgba(63,185,80,0.8)' : 'rgba(248,81,73,0.8)');

  const ctx = document.getElementById('perfChart').getContext('2d');
  if (perfChart) perfChart.destroy();
  perfChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Return %',
        data: returns,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      ...chartDefaults(),
      scales: {
        x: {
          grid: { color: '#21262d' },
          ticks: { color: '#8b949e', font: { family: 'monospace', size: 11 } },
        },
        y: {
          position: 'left',
          grid: { color: '#21262d' },
          ticks: {
            color: '#8b949e',
            font: { family: 'monospace', size: 11 },
            callback: v => v.toFixed(1) + '%',
          },
        },
      },
      plugins: {
        ...chartDefaults().plugins,
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: {
            label: ctx => ` Return: ${ctx.parsed.y.toFixed(2)}%`,
          },
        },
      },
    },
  });
}

// ── Allocation doughnut ───────────────────────────────────────
function renderAllocation(holdings, totalValue) {
  const labels = holdings.map(h => h.symbol);
  const values = holdings.map(h => h.marketValue ?? h.costBasis);
  const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

  const ctx = document.getElementById('allocChart').getContext('2d');
  if (allocChart) allocChart.destroy();
  allocChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#161b22' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const pct = totalValue > 0 ? (ctx.parsed / totalValue * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${pct}%`;
            },
          },
        },
      },
    },
  });

  // Legend
  document.getElementById('allocLegend').innerHTML = labels.map((lbl, i) => {
    const pct = totalValue > 0 ? (values[i] / totalValue * 100).toFixed(1) : '—';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.78rem">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></div>
          <span style="color:var(--text1);font-family:monospace;font-weight:600">${lbl}</span>
        </div>
        <span style="color:var(--text2)">${pct}%</span>
      </div>`;
  }).join('');
}

// ── Risk metrics ──────────────────────────────────────────────
async function renderRisk(holdings, totalValue) {
  // Fetch summaries for beta
  const summaries = await Promise.allSettled(
    holdings.map(h => api.stock(h.symbol).catch(() => null))
  );

  let portfolioBeta = 0;
  let weightedPE    = 0;
  let totalWeight   = 0;
  let maxConcentration = 0;

  holdings.forEach((h, i) => {
    const weight = totalValue > 0 && h.marketValue != null ? h.marketValue / totalValue : 1 / holdings.length;
    const result = summaries[i].status === 'fulfilled' ? summaries[i].value : null;
    const beta   = result?.summary?.defaultKeyStatistics?.beta ?? 1.0;
    const pe     = result?.quote?.pe ?? null;

    portfolioBeta += beta * weight;
    if (pe != null) { weightedPE += pe * weight; totalWeight += weight; }
    if (weight > maxConcentration) maxConcentration = weight;
  });

  const avgPE = totalWeight > 0 ? weightedPE / totalWeight : null;

  // Estimate annualised volatility from individual betas (rough proxy)
  // Market vol ≈ 15% annually
  const mktVol = 0.15;
  const estVol = portfolioBeta * mktVol * 100;

  // Sharpe-like estimate (assume risk-free ≈ 4.5%, avg return from portfolio)
  const portfolio = getPortfolio();
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalVal  = holdings.reduce((s, h) => s + (h.marketValue ?? h.costBasis), 0);
  const totalReturn = totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0;
  const riskFree  = 4.5;
  const sharpe    = estVol > 0 ? ((totalReturn - riskFree) / estVol).toFixed(2) : '—';

  function riskItem(label, value, note, color = '') {
    return `<div class="risk-item">
      <div class="stat-label">${label}</div>
      <div class="stat-value" style="${color ? 'color:' + color : ''}">${value}</div>
      ${note ? `<div style="font-size:0.68rem;color:var(--text3);margin-top:2px">${note}</div>` : ''}
    </div>`;
  }

  const betaColor = portfolioBeta > 1.3 ? 'var(--red)' : portfolioBeta < 0.7 ? 'var(--yellow)' : 'var(--green)';
  const betaNote  = portfolioBeta > 1.3 ? 'High risk' : portfolioBeta < 0.7 ? 'Defensive' : 'Market-like';
  const concPct   = (maxConcentration * 100).toFixed(1);
  const concColor = maxConcentration > 0.4 ? 'var(--red)' : maxConcentration > 0.25 ? 'var(--yellow)' : 'var(--green)';

  document.getElementById('riskGrid').innerHTML = [
    riskItem('Portfolio Beta', portfolioBeta.toFixed(2), betaNote, betaColor),
    riskItem('Est. Volatility', estVol.toFixed(1) + '%', 'Annual, beta-derived'),
    riskItem('Sharpe Ratio', sharpe, 'vs 4.5% risk-free'),
    riskItem('Top Concentration', concPct + '%', 'Largest position', concColor),
    riskItem('Avg P/E', avgPE != null ? avgPE.toFixed(1) : '—', 'Weighted by value'),
    riskItem('Positions', holdings.length, holdings.length < 5 ? 'Under-diversified' : 'Good spread'),
  ].join('');
}

// ── Diversification score ─────────────────────────────────────
function renderDiversification(holdings) {
  const n = holdings.length;
  // Herfindahl-Hirschman Index (HHI) based score
  const totalVal = holdings.reduce((s, h) => s + (h.marketValue ?? h.costBasis), 0);
  const hhi = holdings.reduce((s, h) => {
    const w = totalVal > 0 ? (h.marketValue ?? h.costBasis) / totalVal : 0;
    return s + w * w;
  }, 0);
  // Score 0–100: lower HHI = more diversified
  const score = Math.round((1 - hhi) * 100);
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Moderate' : 'Concentrated';
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? '#7ed957' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
  const note  = n < 5  ? `Add more positions to improve diversification.`
               : n < 10 ? `Consider diversifying across more sectors.`
               : `Well diversified across ${n} positions.`;

  document.getElementById('divNum').textContent   = score;
  document.getElementById('divNum').style.color   = color;
  document.getElementById('divLabel').textContent = label;
  document.getElementById('divBar').style.width   = score + '%';
  document.getElementById('divBar').style.background = color;
  document.getElementById('divNote').textContent  = note;
}

// ── CSV export ────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  const portfolio = getPortfolio();
  if (!portfolio.length) return;
  const rows = [['Symbol','Name','Shares','Avg Price','Buy Date']];
  portfolio.forEach(h => rows.push([h.symbol, h.name || '', h.shares, h.avgPrice, h.buyDate || '']));
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'portfolio.csv';
  a.click();
});

// ── Clear all ─────────────────────────────────────────────────
document.getElementById('clearBtn').addEventListener('click', () => {
  if (confirm('Remove all positions from your portfolio?')) {
    localStorage.removeItem('portfolio');
    location.reload();
  }
});

// ── Add position modal ────────────────────────────────────────
document.getElementById('addManualBtn').addEventListener('click', () => {
  document.getElementById('modalBuyDate').valueAsDate = new Date();
  document.getElementById('addModal').classList.add('show');
});
document.getElementById('cancelAddModal').addEventListener('click', () => {
  document.getElementById('addModal').classList.remove('show');
});
document.getElementById('addModal').addEventListener('click', e => {
  if (e.target === document.getElementById('addModal'))
    document.getElementById('addModal').classList.remove('show');
});

document.getElementById('confirmAddModal').addEventListener('click', () => {
  const sym    = document.getElementById('modalSymbolInput').value.trim().toUpperCase();
  const price  = parseFloat(document.getElementById('modalBuyPrice').value);
  const shares = parseFloat(document.getElementById('modalShares').value);
  const date   = document.getElementById('modalBuyDate').value;
  if (!sym || !price || !shares) { alert('Please fill in symbol, price, and shares.'); return; }

  const portfolio = getPortfolio();
  const existing  = portfolio.findIndex(h => h.symbol === sym);
  if (existing >= 0) {
    const h = portfolio[existing];
    const totalShares = h.shares + shares;
    h.avgPrice = (h.avgPrice * h.shares + price * shares) / totalShares;
    h.shares   = totalShares;
  } else {
    portfolio.push({ symbol: sym, name: sym, shares, avgPrice: price, buyDate: date });
  }
  savePortfolio(portfolio);
  document.getElementById('addModal').classList.remove('show');
  location.reload();
});

// ── Boot ──────────────────────────────────────────────────────
renderPortfolio();
