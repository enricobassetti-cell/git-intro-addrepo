import express from 'express';
import yahooFinance from 'yahoo-finance2';
import Parser from 'rss-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const rss = new Parser({ timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Suppress yahoo-finance2 validation notices
yahooFinance.setGlobalConfig({ validation: { logErrors: false } });

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(quote) {
  if (!quote) return null;
  return {
    symbol: quote.symbol,
    name: quote.shortName || quote.longName || quote.symbol,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePct: quote.regularMarketChangePercent,
    open: quote.regularMarketOpen,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    volume: quote.regularMarketVolume,
    mktCap: quote.marketCap,
    pe: quote.trailingPE,
    eps: quote.epsTrailingTwelveMonths,
    week52High: quote.fiftyTwoWeekHigh,
    week52Low: quote.fiftyTwoWeekLow,
    avgVolume: quote.averageDailyVolume3Month,
    currency: quote.currency,
  };
}

// ─── Market Indices ──────────────────────────────────────────────────────────

app.get('/api/market/indices', async (req, res) => {
  try {
    const symbols = ['^GSPC', '^DJI', '^IXIC', '^RUT', 'BTC-USD', 'GC=F', 'CL=F', '^TNX'];
    const quotes = await yahooFinance.quote(symbols);
    const result = (Array.isArray(quotes) ? quotes : [quotes]).map(q => ({
      symbol: q.symbol,
      name: {
        '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
        '^RUT': 'Russell 2000', 'BTC-USD': 'Bitcoin', 'GC=F': 'Gold',
        'CL=F': 'Crude Oil', '^TNX': '10Y Treasury',
      }[q.symbol] || q.shortName,
      price: q.regularMarketPrice,
      change: q.regularMarketChange,
      changePct: q.regularMarketChangePercent,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Market Movers ───────────────────────────────────────────────────────────

const MOVER_SCREENS = {
  gainers: 'day_gainers',
  losers: 'day_losers',
  active: 'most_actives',
};

app.get('/api/market/movers', async (req, res) => {
  try {
    const { type = 'active' } = req.query;
    const scrId = MOVER_SCREENS[type] || 'most_actives';
    const result = await yahooFinance.screener({ scrIds: scrId, count: 10 });
    res.json((result.quotes || []).map(fmt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Sector Performance ──────────────────────────────────────────────────────

const SECTOR_ETFS = {
  Technology: 'XLK',
  Healthcare: 'XLV',
  Financials: 'XLF',
  Energy: 'XLE',
  'Cons. Discret.': 'XLY',
  Industrials: 'XLI',
  Utilities: 'XLU',
  Materials: 'XLB',
  'Real Estate': 'XLRE',
  'Comm. Services': 'XLC',
  'Cons. Staples': 'XLP',
};

app.get('/api/market/sectors', async (req, res) => {
  try {
    const symbols = Object.values(SECTOR_ETFS);
    const quotes = await yahooFinance.quote(symbols);
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const result = Object.entries(SECTOR_ETFS).map(([name, etf]) => {
      const q = arr.find(x => x.symbol === etf);
      return { name, etf, changePct: q?.regularMarketChangePercent ?? null };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── News Aggregation ────────────────────────────────────────────────────────

const NEWS_FEEDS = [
  { url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',        source: 'WSJ' },
  { url: 'https://feeds.reuters.com/reuters/businessNews',        source: 'Reuters' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NYT' },
  { url: 'http://feeds.marketwatch.com/marketwatch/topstories/',  source: 'MarketWatch' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' },
  { url: 'https://finance.yahoo.com/news/rssindex',               source: 'Yahoo Finance' },
];

app.get('/api/news', async (req, res) => {
  const results = await Promise.allSettled(
    NEWS_FEEDS.map(async ({ url, source }) => {
      const feed = await rss.parseURL(url);
      return feed.items.slice(0, 6).map(item => ({
        title: item.title,
        link: item.link,
        summary: item.contentSnippet || item.summary || '',
        pubDate: item.pubDate || item.isoDate,
        source,
      }));
    })
  );

  const items = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 30);

  res.json(items);
});

// ─── Stock Search ────────────────────────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const result = await yahooFinance.search(q, { quotesCount: 8 });
    const quotes = (result.quotes || []).filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF');
    res.json(quotes.map(q => ({ symbol: q.symbol, name: q.shortname || q.longname, type: q.quoteType, exchange: q.exchange })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stock Quote ─────────────────────────────────────────────────────────────

app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance.quoteSummary(symbol, {
        modules: ['summaryProfile', 'financialData', 'recommendationTrend', 'defaultKeyStatistics', 'earnings'],
      }).catch(() => ({})),
    ]);
    res.json({ quote: fmt(quote), summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stock History ───────────────────────────────────────────────────────────

const PERIOD_MAP = {
  '1d':  { period1: () => new Date(Date.now() - 1  * 24 * 3600e3), interval: '5m'  },
  '5d':  { period1: () => new Date(Date.now() - 5  * 24 * 3600e3), interval: '30m' },
  '1mo': { period1: () => new Date(Date.now() - 30 * 24 * 3600e3), interval: '1d'  },
  '3mo': { period1: () => new Date(Date.now() - 90 * 24 * 3600e3), interval: '1d'  },
  '6mo': { period1: () => new Date(Date.now() - 180* 24 * 3600e3), interval: '1wk' },
  '1y':  { period1: () => new Date(Date.now() - 365* 24 * 3600e3), interval: '1wk' },
  '2y':  { period1: () => new Date(Date.now() - 730* 24 * 3600e3), interval: '1mo' },
};

app.get('/api/stock/:symbol/history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1mo' } = req.query;
    const cfg = PERIOD_MAP[period] || PERIOD_MAP['1mo'];
    const data = await yahooFinance.historical(symbol, {
      period1: cfg.period1(),
      interval: cfg.interval,
    });
    res.json(data.map(d => ({ date: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stock News ──────────────────────────────────────────────────────────────

app.get('/api/stock/:symbol/news', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await yahooFinance.search(symbol, { newsCount: 8, quotesCount: 0 });
    res.json((result.news || []).map(n => ({
      title: n.title,
      link: n.link,
      publisher: n.publisher,
      pubDate: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
      thumbnail: n.thumbnail?.resolutions?.[0]?.url,
    })));
  } catch (err) {
    res.json([]);
  }
});

// ─── Screener ────────────────────────────────────────────────────────────────

const SCREENS = {
  most_actives: 'most_actives',
  day_gainers: 'day_gainers',
  day_losers: 'day_losers',
  undervalued: 'undervalued_growth_stocks',
  growth_tech: 'growth_technology_stocks',
  small_caps: 'aggressive_small_caps',
};

app.get('/api/screener', async (req, res) => {
  try {
    const { screen = 'most_actives', count = 25 } = req.query;
    const scrId = SCREENS[screen] || screen;
    const result = await yahooFinance.screener({ scrIds: scrId, count: parseInt(count) });
    res.json((result.quotes || []).map(fmt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analyst Recommendations (Top Picks) ────────────────────────────────────

const WATCH_LIST = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'JNJ', 'WMT', 'UNH'];

app.get('/api/recommendations', async (req, res) => {
  try {
    const quotes = await yahooFinance.quote(WATCH_LIST);
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const summaries = await Promise.allSettled(
      WATCH_LIST.map(s =>
        yahooFinance.quoteSummary(s, { modules: ['financialData', 'recommendationTrend'] }).catch(() => null)
      )
    );
    const result = arr.map((q, i) => {
      const sum = summaries[i].status === 'fulfilled' ? summaries[i].value : null;
      const rec = sum?.financialData?.recommendationKey || 'none';
      const target = sum?.financialData?.targetMeanPrice || null;
      const trend = sum?.recommendationTrend?.trend?.[0] || {};
      return {
        ...fmt(q),
        recommendation: rec,
        targetPrice: target,
        upside: target && q.regularMarketPrice ? ((target - q.regularMarketPrice) / q.regularMarketPrice) * 100 : null,
        analystBuy: trend.strongBuy + trend.buy || 0,
        analystHold: trend.hold || 0,
        analystSell: trend.sell + trend.strongSell || 0,
      };
    });
    res.json(result.filter(r => r.recommendation && r.recommendation !== 'none'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Multi-quote for portfolio ───────────────────────────────────────────────

app.post('/api/quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!symbols?.length) return res.json([]);
    const quotes = await yahooFinance.quote(symbols);
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    res.json(arr.map(fmt));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Stock Screener running at http://localhost:${PORT}\n`);
});
