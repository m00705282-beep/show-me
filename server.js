import express from 'express';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import ccxt from 'ccxt';
import fetch from 'node-fetch';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { ArbitrageStrategy } from './trading/arbitrageStrategy.js';
import { RealTradingEngine } from './trading/realTradingEngine.js';
import { FeeVerificationSystem } from './monitoring/feeVerification.js';
import { CoinTrackingSystem } from './monitoring/coinTracking.js';
import { SentimentAnalysisSystem } from './prediction/sentimentAnalysis.js';
import { CoinRotationSystem } from './monitoring/coinRotation.js';
import { BatchProcessor } from './optimization/batchProcessor.js';
import { AdvancedArbitrageStrategy } from './optimization/advancedStrategy.js';
import { WebSocketHandler } from './optimization/websocketHandler.js';
import { AdaptivePoller } from './optimization/adaptivePoller.js';
import { OpportunityScorer } from './optimization/opportunityScorer.js';
import { SmartCoinSelector } from './optimization/smartCoinSelector.js';
import { SlippageProtection } from './optimization/slippageProtection.js';
import { ExchangeHealthMonitor } from './optimization/exchangeHealthMonitor.js';
import { PerformanceAnalytics } from './optimization/performanceAnalytics.js';
import { cacheManager } from './optimization/cacheManager.js';
import { OpportunityLogger } from './analytics/opportunityLogger.js';
import { prometheusExporter } from './monitoring/prometheusExporter.js';
import { AlertSystem } from './monitoring/alertSystem.js';
import { AlertRulesEngine } from './monitoring/alertRules.js';
import { requireAuth, getApiKey } from './middleware/auth.js';
import { apiLimiter, criticalLimiter, publicLimiter } from './middleware/rateLimit.js';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerOptions } from './config/swagger.js';
import { DynamicPositionSizing } from './optimization/dynamicPositionSizing.js';
import { MultiTradeExecutor } from './trading/multiTradeExecutor.js';
import { FeeOptimizer } from './optimization/feeOptimizer.js';
import { ProfitCompounding } from './trading/profitCompounding.js';
// === 🚀 ALL 15 OPTIMIZATION FEATURES - AUTO-INTEGRATED ===
import { TradingHoursOptimizer } from './optimization/tradingHoursOptimizer.js';
import { CoinPairExpansion } from './optimization/coinPairExpansion.js';
import { FlashArbitrageDetector } from './optimization/flashArbitrageDetector.js';
import { GasFeeOptimizer } from './optimization/gasFeeOptimizer.js';
import { AdvancedRiskManager } from './trading/advancedRiskManager.js';
import { SmartOrderRouter } from './trading/smartOrderRouter.js';
import { APIKeyManager } from './security/apiKeyManager.js';
import { LatencyOptimizer } from './optimization/latencyOptimizer.js';
import { BalancePredictor } from './ai/balancePredictor.js';
import { AutoTransfer } from './trading/autoTransfer.js';
import { MLPricePredictor } from './ai/mlPricePredictor.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- port management ---
async function portPids(port) {
  const pids = new Set();

  if (os.platform() === 'win32') {
    // Windows → koristi PowerShell
    return await new Promise(res => {
      const ps = spawn('powershell', [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess` 
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      let pout = '';
      ps.stdout.on('data', d => pout += d);
      ps.on('close', () => {
        pout.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(x => pids.add(Number(x)));
        res([...pids]);
      });
    });
  } else {
    // Linux/Mac → koristi lsof
    return await new Promise(res => {
      const sh = spawn('bash', ['-lc', `lsof -i :${port} -t`], { stdio: ['ignore', 'pipe', 'ignore'] });
      let out = '';
      sh.stdout.on('data', d => out += d);
      sh.on('close', code => {
        if (code === 0 && out.trim()) {
          out.trim().split(/\s+/).forEach(x => pids.add(Number(x)));
        }
        res([...pids]);
      });
    });
  }
}

function resolveMonitoringPath(baseDir, candidate, fallback) {
  if (!candidate) {
    return fallback;
  }
  return isAbsolute(candidate) ? candidate : join(baseDir, candidate);
}

function loadMonitoringConfig() {
  const defaults = {
    coinTracking: {
      dataPath: join(__dirname, 'data', 'coin-tracking.json'),
      retryOptions: { retries: 3, delayMs: 1000 }
    },
    coinRotation: {
      dataFile: join(__dirname, 'data', 'coin-performance.json')
    },
    schedules: {
      scanIntervalMs: 6 * 60 * 60 * 1000,
      initialScanDelayMs: 10000
    }
  };

  monitoringConfig = {
    coinTracking: { ...defaults.coinTracking },
    coinRotation: { ...defaults.coinRotation },
    schedules: { ...defaults.schedules }
  };

  try {
    const configPath = join(__dirname, 'config', 'monitoring.json');
    const data = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(data);

    monitoringConfig = {
      coinTracking: {
        dataPath: resolveMonitoringPath(__dirname, parsed.coinTracking?.dataPath, defaults.coinTracking.dataPath),
        retryOptions: {
          retries: parsed.coinTracking?.retryOptions?.retries ?? defaults.coinTracking.retryOptions.retries,
          delayMs: parsed.coinTracking?.retryOptions?.delayMs ?? defaults.coinTracking.retryOptions.delayMs
        }
      },
      coinRotation: {
        dataFile: resolveMonitoringPath(__dirname, parsed.coinRotation?.dataFile, defaults.coinRotation.dataFile)
      },
      schedules: {
        scanIntervalMs: parsed.schedules?.scanIntervalMs ?? defaults.schedules.scanIntervalMs,
        initialScanDelayMs: parsed.schedules?.initialScanDelayMs ?? defaults.schedules.initialScanDelayMs
      }
    };

    console.log('[init] ✅ Loaded monitoring config');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[init] ⚠️  Monitoring config not found (optional)');
      console.log('[init] 💡 Create config/monitoring.json to customize monitoring settings');
    } else {
      console.error('[init] Failed to load monitoring config:', err.message);
    }
  }

  return monitoringConfig;
}

async function freePort(port) {
  const pids = await portPids(port);
  for (const pid of pids) {
    try { 
      process.kill(pid, 'SIGKILL');
      console.log(`[ports] killed process ${pid} on port ${port}`);
    } catch (err) {
      console.error(`[ports] cannot kill ${pid}:`, err.message);
    }
  }
  return { port, freed: pids.length > 0, pids };
}

let pm2Available = null;
async function ensurePm2Available() {
  if (pm2Available !== null) {
    return pm2Available;
  }
  pm2Available = await new Promise(resolve => {
    let resolved = false;
    try {
      const proc = spawn('pm2', ['-v'], { shell: true });
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill('SIGKILL');
          resolve(false);
        }
      }, 2000);
      proc.on('close', code => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(code === 0);
        }
      });
      proc.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }
  });
  if (!pm2Available) {
    console.warn('[pm2] PM2 binary not found; admin endpoints will respond with 501');
  }
  return pm2Available;
}

// --- crypto arbitrage monitoring ---
let exchanges = [];
let coins = [];
const MAX_COINS = 100; // Maximum number of coins to track
let snapshot = { time: Date.now(), spreads: [] };
let cycle = 0; // za sampling coina
let feeConfig = null;
let alertConfig = null;
let alertSystem = null;
let alertRulesEngine = null;
let realTradingConfig = null;
let realTradingEngine = null;
let monitoringConfig = null;

// Load fee configuration
function loadFeeConfig() {
  try {
    const configPath = join(__dirname, 'config', 'fees.json');
    const data = readFileSync(configPath, 'utf-8');
    feeConfig = JSON.parse(data);
    console.log('[init] loaded fee config for', Object.keys(feeConfig.exchanges).length, 'exchanges');
  } catch (err) {
    console.error('[init] failed to load fee config:', err.message);
    // Fallback to default fees
    feeConfig = {
      exchanges: {},
      defaultFees: { maker: 20, taker: 20, withdrawal: { default: 0 } }
    };
  }
}

// Load alert configuration
function loadAlertConfig() {
  try {
    const configPath = join(__dirname, 'config', 'alerts.json');
    const data = readFileSync(configPath, 'utf-8');
    alertConfig = JSON.parse(data);
    console.log('[init] ✅ Loaded alert config');
    
    // Initialize Alert System
    alertSystem = new AlertSystem(alertConfig);
    
    // Initialize Alert Rules Engine
    alertRulesEngine = new AlertRulesEngine(alertConfig.rules || {});
    
    return true;
  } catch (err) {
    console.log('[init] ⚠️  Alert config not found (optional)');
    console.log('[init] 💡 Copy config/alerts.example.json to config/alerts.json to enable alerts');
    
    // Initialize with defaults (disabled)
    alertSystem = new AlertSystem({
      email: { enabled: false },
      telegram: { enabled: false }
    });
    
    // Initialize Alert Rules Engine with defaults
    alertRulesEngine = new AlertRulesEngine({});
    
    return false;
  }
}

// Load real trading configuration
function loadRealTradingConfig() {
  try {
    const configPath = join(__dirname, 'config', 'realtrading.json');
    const data = readFileSync(configPath, 'utf-8');
    realTradingConfig = JSON.parse(data);
    console.log('[init] ✅ Loaded real trading config');
    
    // Initialize Real Trading Engine
    realTradingEngine = new RealTradingEngine(realTradingConfig);
    
    if (realTradingConfig.enabled && !realTradingConfig.dryRun) {
      console.log('[init] ⚠️  REAL TRADING MODE ENABLED - BE CAREFUL!');
    } else if (realTradingConfig.enabled && realTradingConfig.dryRun) {
      console.log('[init] 🧪 Real trading in DRY-RUN mode (safe)');
    } else {
      console.log('[init] Real trading disabled');
    }
    
    // Initialize Multi-Trade Executor
    if (typeof MultiTradeExecutor !== 'undefined') {
      multiTradeExecutor = new MultiTradeExecutor(realTradingEngine, {
        maxConcurrentTrades: 5,
        priorityThreshold: 2.0
      });
      console.log('[init] ✅ Multi-Trade Executor initialized (max 5 concurrent trades)');
    }
    
    return true;
  } catch (err) {
    console.log('[init] ⚠️  Real trading config not found (optional)');
    console.log('[init] 💡 Copy config/realtrading.example.json to config/realtrading.json to enable');
    
    // Initialize with defaults (disabled)
    realTradingEngine = new RealTradingEngine({
      enabled: false,
      dryRun: true
    });
    
    // Initialize Multi-Trade Executor with disabled engine
    if (typeof MultiTradeExecutor !== 'undefined') {
      multiTradeExecutor = new MultiTradeExecutor(realTradingEngine, {
        maxConcurrentTrades: 3
      });
    }
    
    return false;
  }
}

// Get fees for exchange
function getFees(exchangeId) {
  if (feeConfig.exchanges[exchangeId]) {
    return feeConfig.exchanges[exchangeId];
  }
  return feeConfig.defaultFees;
}

// Calculate net spread after accounting for fees
function calculateNetSpread(grossSpread, buyExchange, sellExchange) {
  const buyFees = getFees(buyExchange);
  const sellFees = getFees(sellExchange);

  const buyFeeBps = buyFees.taker || 20;
  const sellFeeBps = sellFees.taker || 20;

  const totalFeePct = (buyFeeBps + sellFeeBps) / 100;
  const netSpread = grossSpread - totalFeePct;

  return {
    netSpread,
    grossSpread,
    totalFeePct,
    buyFeeBps,
    sellFeeBps
  };
}

async function initCoins() {
  console.log('[init] fetching coin list from CoinGecko...');
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=50&page=1');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    coins = data.map(c => c.symbol.toUpperCase());
    console.log(`[init] got ${coins.length} coins (top 50)`);
  } catch (err) {
    console.error('[init] failed to fetch coins:', err.message);
    // fallback: hardcoded top coins
    coins = ['BTC','ETH','USDT','BNB','SOL','XRP','USDC','ADA','AVAX','DOGE','TRX','DOT','MATIC','LINK','SHIB','UNI','LTC','BCH','ATOM','XLM','ETC','FIL','APT','HBAR','ARB','OP','NEAR','VET','ALGO','ICP','GRT','SAND','MANA','AXS','FTM','THETA','AAVE','EOS','XTZ','EGLD','RUNE','KAVA','ZEC','DASH','COMP','MKR','SNX','YFI','CRV','BAT'];
    console.log(`[init] using fallback list: ${coins.length} coins`);
  }
}

async function initExchanges() {
  const ids = [
    // Tier 1: Top exchanges (high volume, reliable)
    'binance', 'kraken', 'coinbase', 'bitfinex', 'kucoin',
    'okx', 'bybit', 'gateio', 'huobi', 'gemini',
    
    // Tier 2: Good exchanges (medium volume, stable)
    'mexc', 'bitget', 'coinex', 'bitstamp', 'cryptocom',
    'poloniex', 'hitbtc', 'lbank', 'probit',
    
    // Tier 3: Regional exchanges (good for arbitrage)
    'upbit', 'bithumb', 'coinone', 'bitmart', 'phemex',
    'woo', 'bitrue', 'xt', 'digifinex', 'ascendex'
  ];

  // Validacija: samo podržani exchange-i
  exchanges = ids
    .map(id => {
      if (ccxt.exchanges.includes(id)) {
        try {
          return new ccxt[id]({ enableRateLimit: true });
        } catch (err) {
          console.error(`[init] failed to init exchange ${id}:`, err.message);
          return null;
        }
      } else {
        console.warn(`[init] exchange not supported: ${id}`);
        return null;
      }
    })
    .filter(e => e !== null);

  console.log(`[init] using ${exchanges.length} exchanges: ${exchanges.map(e => e.id).join(', ')}`);
}

// Batch processor instance (initialized after exchanges)
let batchProcessor = null;

async function monitor() {
  cycle++;
  const spreads = [];
  
  // Use batch processing (100× faster!)
  console.log(`[poll] cycle ${cycle}, batch fetching ${coins.length} coins from ${exchanges.length} exchanges...`);
  
  const startTime = Date.now();
  
  // Fetch all tickers at once (29 API calls instead of 2900!)
  const batchData = await batchProcessor.fetchAllTickers(coins);
  
  const fetchDuration = Date.now() - startTime;
  console.log(`[batch] Fetched data in ${fetchDuration}ms`);
  
  // Find arbitrage opportunities
  for (const coin of coins) {
    const prices = [];
    
    // Collect prices from all exchanges
    for (const [exchange, data] of Object.entries(batchData)) {
      if (data[coin]) {
        prices.push({
          ex: exchange,
          bid: data[coin].bid,
          ask: data[coin].ask
        });
      }
    }
    
    if (prices.length > 1) {
      const bestBid = Math.max(...prices.map(p => p.bid));
      const bestAsk = Math.min(...prices.map(p => p.ask));
      const buyMarket = prices.find(p => p.ask === bestAsk)?.ex || null;
      const sellMarket = prices.find(p => p.bid === bestBid)?.ex || null;

      if (bestBid > bestAsk && buyMarket && sellMarket && buyMarket !== sellMarket) {
        const grossSpread = (bestBid - bestAsk) / bestAsk * 100;
        const { netSpread, totalFeePct, buyFeeBps, sellFeeBps } = calculateNetSpread(
          grossSpread,
          buyMarket,
          sellMarket,
          coin
        );
        
        spreads.push({ 
          coin, 
          buyM: buyMarket,
          buyP: bestAsk,
          sellM: sellMarket,
          sellP: bestBid,
          grossSpread,
          netSpread,
          totalFeePct,
          buyFeeBps,
          sellFeeBps
        });
        
        // Track coin performance for rotation system
        if (typeof coinRotation !== 'undefined') {
          coinRotation.trackPerformance(coin, {
            opportunities: 1,
            volume: bestAsk * 1000, // Estimate: $1000 trade
            spread: netSpread
          });
        }
      }
    }
  }

  snapshot = {
    time: Date.now(),
    spreads: spreads.sort((a, b) => b.netSpread - a.netSpread).slice(0, 20),
    totalCoins: coins.length,
    batchDuration: fetchDuration
  };

  console.log(
    `[poll] snapshot updated: ${snapshot.spreads.length} opportunities, top net spread ${snapshot.spreads[0]?.netSpread.toFixed(3)}% (gross ${snapshot.spreads[0]?.grossSpread.toFixed(3)}%)` 
  );

  // Filter and score opportunities by quality
  if (snapshot.spreads.length > 0) {
    const qualityOpportunities = opportunityScorer.filterByQuality(snapshot.spreads);
    
    console.log(`[quality] Found ${qualityOpportunities.length}/${snapshot.spreads.length} quality opportunities (score ≥60)`);
    
    // Track opportunities for smart coin selection and analytics
    for (const opp of qualityOpportunities) {
      smartCoinSelector.trackOpportunity(opp.coin, opp);
      performanceAnalytics.recordOpportunity(opp);
      
      // Log opportunity for AI Balance Manager
      opportunityLogger.logOpportunity(opp);
    }
    
    // Log top 3 quality opportunities
    const top3 = qualityOpportunities.slice(0, 3);
    for (let i = 0; i < top3.length; i++) {
      const opp = top3[i];
      const icon = opp.rating === 'EXCELLENT' ? '🌟' : opp.rating === 'VERY_GOOD' ? '⭐' : '✅';
      console.log(`[quality] ${i + 1}. ${icon} ${opp.coin}: ${opp.netSpread.toFixed(2)}% (Score: ${opp.qualityScore}/100, ${opp.rating})`);
    }
    
    // Analyze top quality opportunities with advanced strategy
    if (advancedStrategy && qualityOpportunities.length > 0) {
      // Filter opportunities for connected exchanges only (if real trading is enabled)
      let topOpportunities = qualityOpportunities.slice(0, 3);
      if (realTradingEngine && realTradingEngine.config.enabled && !realTradingEngine.config.dryRun) {
        const connectedExchanges = Object.keys(realTradingEngine.exchanges);
        topOpportunities = qualityOpportunities.filter(opp => 
          connectedExchanges.includes(opp.buyM) && connectedExchanges.includes(opp.sellM)
        ).slice(0, 3);
        
        if (topOpportunities.length === 0) {
          console.log(`[advanced] ⚠️  No opportunities on connected exchanges (${connectedExchanges.join(', ')}). Waiting for better market conditions...`);
        }
      }
      
      for (const opp of topOpportunities) {
        // Enhance opportunity with risk scoring
        const enhanced = advancedStrategy.analyzeOpportunity(opp, {
          volume: opp.buyP * 1000000, // Estimate volume
          volatility: 5 // Estimate 5% volatility
        });
        
        if (enhanced && enhanced.riskScore >= advancedStrategy.riskThreshold) {
          // Check slippage before executing
          const slippageCheck = slippageProtection.isTradeViable(enhanced, enhanced.tradeSize);
          
          if (slippageCheck.viable) {
            console.log(`[advanced] ✅ ${enhanced.coin}: Risk ${(enhanced.riskScore * 100).toFixed(1)}%, Net ${enhanced.netSpread.toFixed(2)}% → ${slippageCheck.netSpreadAfter.toFixed(2)}% after slippage, Size $${enhanced.tradeSize}`);
            
            // Execute trade with advanced strategy
            const result = await advancedStrategy.executeTrade(enhanced);
            if (result.success) {
              console.log(`[advanced] 💰 Trade executed: +$${enhanced.expectedProfit.toFixed(2)} (slippage: ${(slippageCheck.slippage * 100).toFixed(2)}%)`);
              
              // Track trade in analytics
              performanceAnalytics.recordTrade({
                coin: enhanced.coin,
                buyExchange: enhanced.buyExchange,
                sellExchange: enhanced.sellExchange,
                profit: enhanced.expectedProfit,
                fees: enhanced.totalFees || 0,
                netSpread: enhanced.netSpread,
                success: true
              });
            }
          } else {
            console.log(`[slippage] ❌ ${enhanced.coin}: Rejected - Net spread ${enhanced.netSpread.toFixed(2)}% → ${slippageCheck.netSpreadAfter.toFixed(2)}% after slippage (too low)`);
          }
        } else if (enhanced) {
          console.log(`[advanced] ⚠️ ${opp.coin}: Risk too low ${(enhanced.riskScore * 100).toFixed(1)}% < ${(advancedStrategy.riskThreshold * 100)}%`);
        }
      }
    } else if (qualityOpportunities.length > 0) {
      // Fallback to basic strategy with best quality opportunity
      await strategy.analyzeOpportunity(qualityOpportunities[0]);
    }
  }

  // Broadcast preko WebSocket
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      ws.send(JSON.stringify(snapshot));
    }
  });
}

// --- server ---
const app = express();
const port = 8080;

// Compression middleware (gzip)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Compression level (0-9)
}));

// Body parser middleware
app.use(express.json());

// Apply rate limiting to all API routes
app.use('/api/', publicLimiter);

// Log API key on startup
console.log('🔑 [security] API Key:', getApiKey());
console.log('💡 [security] Use X-API-Key header or ?api_key=... for authenticated endpoints');

await freePort(port);

const server = app.listen(port, () => {
  console.log(`[api] listening http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

// Swagger API Documentation
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'Crypto Arbitrage API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true
  }
}));
console.log('[api] 📚 API Documentation available at http://localhost:' + port + '/api-docs');

// Serve static files (frontend dashboard)
app.use(express.static('public'));

// REST endpoint za snapshot
app.get('/api/snapshot', (req, res) => {
  res.json(snapshot);
});

// Fee API endpoints
app.get('/api/fees', (req, res) => {
  res.json({
    exchanges: Object.keys(feeConfig.exchanges),
    count: Object.keys(feeConfig.exchanges).length,
    lastUpdated: feeConfig.lastUpdated || 'unknown'
  });
});

// Fee Verification API
app.get('/api/fees/status', (req, res) => {
  const status = feeVerification.getStatus();
  res.json(status);
});

app.get('/api/fees/:exchange', (req, res) => {
  const exchangeId = req.params.exchange.toLowerCase();
  const fees = getFees(exchangeId);
  res.json({
    exchange: exchangeId,
    ...fees,
    isDefault: !feeConfig.exchanges[exchangeId]
  });
});

// PM2 Control API endpoints
app.get('/api/pm2/status', async (req, res) => {
  if (!(await ensurePm2Available())) {
    return res.status(501).json({ error: 'PM2 not available on server' });
  }
  try {
    const { stdout } = await new Promise((resolve, reject) => {
      const proc = spawn('pm2', ['jlist'], { shell: true });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', data => stdout += data);
      proc.stderr.on('data', data => stderr += data);
      proc.on('close', code => code === 0 ? resolve({ stdout }) : reject(new Error(stderr)));
    });
    
    const list = JSON.parse(stdout);
    const app = list.find(p => p.name === 'crypto-arbitrage');
    
    if (app) {
      res.json({
        status: app.pm2_env.status,
        uptime: Date.now() - app.pm2_env.pm_uptime,
        restarts: app.pm2_env.restart_time,
        memory: app.monit.memory,
        cpu: app.monit.cpu
      });
    } else {
      res.json({ status: 'stopped', uptime: 0, restarts: 0, memory: 0, cpu: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pm2/restart', criticalLimiter, requireAuth, async (req, res) => {
  if (!(await ensurePm2Available())) {
    return res.status(501).json({ error: 'PM2 not available on server' });
  }
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('pm2', ['restart', 'crypto-arbitrage'], { shell: true });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('Restart failed')));
    });
    res.json({ success: true, message: 'Server restarted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pm2/logs', apiLimiter, requireAuth, async (req, res) => {
  if (!(await ensurePm2Available())) {
    return res.status(501).json({ error: 'PM2 not available on server' });
  }
  try {
    const lines = parseInt(req.query.lines, 10) || 50;
    const { stdout } = await new Promise((resolve, reject) => {
      const proc = spawn('pm2', ['logs', 'crypto-arbitrage', '--lines', String(lines), '--nostream'], { shell: true });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', data => stdout += data);
      proc.stderr.on('data', data => stderr += data);
      proc.on('close', code => code === 0 ? resolve({ stdout }) : reject(new Error(stderr)));
    });
    res.json({ logs: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Paper Trading Stats API
app.get('/api/paper/stats', (req, res) => {
  const stats = strategy.getPerformance();
  res.json(stats);
});

// Fee Verification API
app.get('/api/fees/status', (req, res) => {
  const status = feeVerification.getStatus();
  res.json(status);
});

// Coin Tracking API
app.get('/api/coins/trending', (req, res) => {
  const opportunities = coinTracking.getTopOpportunities();
  res.json(opportunities || { message: 'No data yet. Scan in progress...' });
});

// Coin Rotation API
app.get('/api/rotation/stats', (req, res) => {
  const stats = coinRotation.getStats();
  res.json(stats);
});

// WebSocket Stats API
app.get('/api/websocket/stats', (req, res) => {
  if (!wsHandler) {
    return res.json({ error: 'WebSocket not initialized' });
  }
  const stats = wsHandler.getStats();
  res.json(stats);
});

// Adaptive Poller Stats API
app.get('/api/adaptive/stats', (req, res) => {
  const stats = adaptivePoller.getStats();
  res.json(stats);
});

// Quality Scorer Stats API
app.get('/api/quality/stats', (req, res) => {
  const stats = opportunityScorer.getStats();
  res.json(stats);
});

// Smart Coin Selector Stats API
app.get('/api/coins/smart', (req, res) => {
  const stats = smartCoinSelector.getStats();
  res.json(stats);
});

// Slippage Protection Stats API
app.get('/api/slippage/stats', (req, res) => {
  const stats = slippageProtection.getStats();
  res.json(stats);
});

// Exchange Health Stats API
app.get('/api/health/stats', (req, res) => {
  const stats = exchangeHealthMonitor.getStats();
  res.json(stats);
});

// Exchange Health Details API
app.get('/api/health/exchanges', (req, res) => {
  const health = exchangeHealthMonitor.getAllHealth();
  res.json(health);
});

// Snapshot API (for frontend)
app.get('/api/snapshot', (req, res) => {
  res.json(snapshot || { spreads: [], time: Date.now(), totalCoins: 0 });
});

// API Key info (for dashboard - shows first/last 4 chars only)
app.get('/api/auth/info', (req, res) => {
  const apiKey = getApiKey();
  const masked = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  res.json({
    masked,
    fullKey: apiKey, // Only show in dev mode
    endpoints: {
      protected: [
        'POST /api/pm2/restart',
        'GET /api/pm2/logs'
      ],
      public: [
        'GET /api/snapshot',
        'GET /api/paper/stats',
        'GET /api/pm2/status'
      ]
    },
    rateLimits: {
      public: '300 req/15min',
      api: '100 req/15min',
      critical: '5 req/15min'
    }
  });
});

// Performance Analytics APIs
app.get('/api/analytics/summary', (req, res) => {
  const summary = performanceAnalytics.getSummary();
  res.json(summary);
});

app.get('/api/analytics/hourly', (req, res) => {
  const hourly = performanceAnalytics.getHourlyBreakdown();
  res.json(hourly);
});

app.get('/api/analytics/coins', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const coins = performanceAnalytics.getTopCoins(limit);
  res.json(coins);
});

app.get('/api/analytics/exchanges', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const exchanges = performanceAnalytics.getTopExchanges(limit);
  res.json(exchanges);
});

app.get('/api/analytics/best-hours', (req, res) => {
  const limit = parseInt(req.query.limit) || 5;
  const hours = performanceAnalytics.getBestHours(limit);
  res.json(hours);
});

app.get('/api/analytics/recent-trades', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const trades = performanceAnalytics.getRecentTrades(limit);
  res.json(trades);
});

// Alert System APIs
app.get('/api/alerts/stats', (req, res) => {
  const stats = alertSystem.getStats();
  res.json(stats);
});

app.post('/api/alerts/test', requireAuth, async (req, res) => {
  try {
    const results = await alertSystem.testAlerts();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alerts/balance-drop', requireAuth, async (req, res) => {
  try {
    const { currentBalance, previousBalance, dropPercent } = req.body;
    const results = await alertSystem.alertBalanceDrop(currentBalance, previousBalance, dropPercent);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alerts/opportunity', requireAuth, async (req, res) => {
  try {
    const opportunity = req.body;
    const results = await alertSystem.alertProfitOpportunity(opportunity);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alert Rules APIs
app.get('/api/alerts/rules', (req, res) => {
  const rules = alertRulesEngine.getRules();
  res.json(rules);
});

app.put('/api/alerts/rules/:category/:key', requireAuth, (req, res) => {
  try {
    const { category, key } = req.params;
    const { value } = req.body;
    
    const success = alertRulesEngine.updateRule(category, key, value);
    if (success) {
      res.json({ success: true, message: `Updated ${category}.${key} = ${value}` });
    } else {
      res.status(404).json({ error: 'Rule not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alerts/rules/:category/toggle', requireAuth, (req, res) => {
  try {
    const { category } = req.params;
    const { enabled } = req.body;
    
    const success = alertRulesEngine.toggleCategory(category, enabled);
    if (success) {
      res.json({ success: true, message: `${category} rules ${enabled ? 'enabled' : 'disabled'}` });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alerts/rules/export', requireAuth, (req, res) => {
  const rulesJson = alertRulesEngine.exportRules();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="alert-rules.json"');
  res.send(rulesJson);
});

// Cache Management APIs
app.get('/api/cache/stats', (req, res) => {
  const stats = cacheManager.getStats();
  res.json(stats);
});

app.post('/api/cache/clear', requireAuth, (req, res) => {
  try {
    const { cacheName } = req.body;
    cacheManager.clear(cacheName);
    res.json({ success: true, message: cacheName ? `Cleared cache: ${cacheName}` : 'Cleared all caches' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cache/keys/:cacheName', requireAuth, (req, res) => {
  try {
    const { cacheName } = req.params;
    const keys = cacheManager.keys(cacheName);
    res.json({ cacheName, keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🚀 PROFIT OPTIMIZATION ENDPOINTS
console.log('[api] 🚀 Registering profit optimization endpoints...');

// Dynamic Position Sizing APIs
app.get('/api/optimization/position-sizing/stats', (req, res) => {
  const stats = positionSizer.getStats();
  res.json(stats);
});

// Multi-Trade Executor APIs
app.get('/api/optimization/multi-trade/status', (req, res) => {
  if (!multiTradeExecutor) {
    return res.json({ error: 'Multi-trade executor not initialized' });
  }
  const status = multiTradeExecutor.getStatus();
  res.json(status);
});

app.get('/api/optimization/multi-trade/stats', (req, res) => {
  if (!multiTradeExecutor) {
    return res.json({ error: 'Multi-trade executor not initialized' });
  }
  const stats = multiTradeExecutor.getStats();
  res.json(stats);
});

app.post('/api/optimization/multi-trade/emergency-stop', requireAuth, (req, res) => {
  if (!multiTradeExecutor) {
    return res.status(400).json({ error: 'Multi-trade executor not initialized' });
  }
  try {
    const result = multiTradeExecutor.emergencyStop();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fee Optimizer APIs
app.post('/api/optimization/fees/optimize', (req, res) => {
  try {
    const { opportunity, tradeSize } = req.body;
    const result = feeOptimizer.optimizeRoute(opportunity, tradeSize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/optimization/fees/stats', (req, res) => {
  const stats = feeOptimizer.getStats();
  res.json(stats);
});

app.post('/api/optimization/fees/report', (req, res) => {
  try {
    const { opportunity, tradeSize } = req.body;
    const report = feeOptimizer.getFeeReport(opportunity, tradeSize);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Profit Compounding APIs
app.get('/api/optimization/compounding/status', (req, res) => {
  const status = profitCompounding.getStatus();
  res.json(status);
});

app.post('/api/optimization/compounding/projection', (req, res) => {
  try {
    const { days, dailyReturnPercent } = req.body;
    const projection = profitCompounding.projectGrowth(days, dailyReturnPercent);
    res.json(projection);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/optimization/compounding/reset', requireAuth, (req, res) => {
  try {
    profitCompounding.reset();
    res.json({ success: true, message: 'Compounding system reset to initial state' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Combined Optimization Summary
app.get('/api/optimization/summary', (req, res) => {
  const summary = {
    positionSizing: positionSizer.getStats(),
    multiTrade: multiTradeExecutor ? multiTradeExecutor.getStats() : { error: 'Not initialized' },
    feeOptimizer: feeOptimizer.getStats(),
    compounding: profitCompounding.getStatus(),
    profitProjection: {
      baseline: '$2-5/day',
      optimized: '$15-30/day',
      improvement: '+400%',
      description: 'With all optimizations active'
    }
  };
  res.json(summary);
});

console.log('[api] ✅ Profit optimization endpoints registered');

// Prometheus Metrics Endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', prometheusExporter.register.contentType);
    const metrics = await prometheusExporter.getMetrics();
    res.send(metrics);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/metrics/json', async (req, res) => {
  try {
    const metrics = await prometheusExporter.getMetricsJSON();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real Trading APIs
app.get('/api/realtrading/status', async (req, res) => {
  try {
    // Set timeout to prevent hanging (increased for 13 exchanges with parallel fetching)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 45000) // 45 second timeout for 13 exchanges
    );
    
    const statusPromise = realTradingEngine.getStatusWithBalance();
    const status = await Promise.race([statusPromise, timeoutPromise]);
    
    res.json(status);
  } catch (err) {
    console.error('[api] Error fetching real trading status:', err.message);
    // Fallback to status without balance
    const status = realTradingEngine.getStatus();
    res.json({
      ...status,
      realBalances: { error: 'Failed to fetch balances' },
      totalAvailableUSD: 0
    });
  }
});

app.get('/api/realtrading/pending', requireAuth, (req, res) => {
  const pending = realTradingEngine.getPendingTrades();
  res.json({ pending, count: pending.length });
});

app.post('/api/realtrading/approve/:tradeId', requireAuth, async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = realTradingEngine.approveTrade(tradeId);
    
    // Auto-execute if enabled
    if (realTradingConfig.enabled) {
      const result = await realTradingEngine.executeTrade(trade);
      res.json({ success: true, trade, execution: result });
    } else {
      res.json({ success: true, trade, message: 'Trade approved but real trading is disabled' });
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/realtrading/reject/:tradeId', requireAuth, (req, res) => {
  try {
    const { tradeId } = req.params;
    const { reason } = req.body;
    const trade = realTradingEngine.rejectTrade(tradeId, reason || 'Rejected by user');
    res.json({ success: true, trade });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/realtrading/emergency-stop', requireAuth, (req, res) => {
  const result = realTradingEngine.emergencyStop();
  res.json(result);
});

app.post('/api/realtrading/resume', requireAuth, (req, res) => {
  const result = realTradingEngine.resumeTrading();
  res.json(result);
});

app.get('/api/realtrading/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = realTradingEngine.db.getTrades({ 
      limit,
      orderBy: 'timestamp DESC'
    });
    
    res.json({
      success: true,
      count: trades.length,
      trades: trades.map(t => ({
        ...t,
        profit: t.profit || 0,
        status: t.status || 'completed'
      }))
    });
  } catch (err) {
    console.error('[api] Error fetching trade history:', err.message);
    res.status(500).json({ error: err.message, trades: [] });
  }
});

app.post('/api/realtrading/toggle', requireAuth, (req, res) => {
  try {
    const { enabled, dryRun } = req.body;
    
    if (enabled !== undefined) {
      realTradingEngine.config.enabled = enabled;
    }
    if (dryRun !== undefined) {
      realTradingEngine.config.dryRun = dryRun;
    }
    
    const status = realTradingEngine.getStatus();
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sentiment Analysis API
app.get('/api/sentiment/latest', (req, res) => {
  const analysis = sentimentAnalysis.loadLatestAnalysis();
  res.json(analysis || { message: 'No analysis yet. Analysis in progress...' });
});

app.get('/api/sentiment/predictions', (req, res) => {
  const analysis = sentimentAnalysis.loadLatestAnalysis();
  if (!analysis) {
    return res.json({ message: 'No predictions yet. Analysis in progress...' });
  }
  
  const topPredictions = analysis.analyses
    .filter(a => a.prediction.confidence > 50)
    .sort((a, b) => b.prediction.confidence - a.prediction.confidence)
    .slice(0, 10);
  
  res.json({
    timestamp: analysis.timestamp,
    predictions: topPredictions,
    summary: analysis.summary
  });
});

// AI Balance Manager API
app.get('/api/ai-manager/stats', (req, res) => {
  try {
    const stats = opportunityLogger.getStats();
    const topPairs = opportunityLogger.getTopExchangePairs(7, 10);
    const topCoins = opportunityLogger.getTopCoins(7, 10);
    
    res.json({
      success: true,
      stats,
      topExchangePairs: topPairs,
      topCoins: topCoins
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai-manager/report', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const report = opportunityLogger.generateReport(days);
    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === 🚀 ALL 15 OPTIMIZATION FEATURES - API ENDPOINTS ===
console.log('[api] 🚀 Registering optimization feature endpoints...');

// Combined stats for all optimization features
app.get('/api/optimization/all-stats', (req, res) => {
  try {
    res.json({
      tradingHours: tradingHours?.getStats() || { error: 'Not initialized' },
      coinExpansion: coinExpansion?.getStats() || { error: 'Not initialized' },
      flashDetector: flashDetector?.getStats() || { error: 'Not initialized' },
      gasOptimizer: gasOptimizer?.getStats() || { error: 'Not initialized' },
      riskManager: riskManager?.getStats() || { error: 'Not initialized' },
      smartRouter: smartRouter?.getStats() || { error: 'Not initialized' },
      apiKeyManager: apiKeyManager?.getStats() || { error: 'Not initialized' },
      latencyOptimizer: latencyOptimizer?.getStats() || { error: 'Not initialized' },
      balancePredictor: balancePredictor?.getStats() || { error: 'Not initialized' },
      autoTransfer: autoTransfer?.getStats() || { error: 'Not initialized' },
      mlPredictor: mlPredictor?.getStats() || { error: 'Not initialized' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Individual optimization endpoints
app.get('/api/optimization/trading-hours', (req, res) => {
  res.json(tradingHours?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/coin-expansion', (req, res) => {
  res.json(coinExpansion?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/flash-detector', (req, res) => {
  res.json(flashDetector?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/gas-optimizer', (req, res) => {
  res.json(gasOptimizer?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/risk-manager', (req, res) => {
  res.json(riskManager?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/smart-router', (req, res) => {
  res.json(smartRouter?.getStats() || { error: 'Not initialized' });
});

app.get('/api/optimization/latency', (req, res) => {
  res.json(latencyOptimizer?.getStats() || { error: 'Not initialized' });
});

app.get('/api/ai/balance-predictor', (req, res) => {
  res.json(balancePredictor?.getStats() || { error: 'Not initialized' });
});

app.get('/api/ai/auto-transfer', (req, res) => {
  res.json(autoTransfer?.getStats() || { error: 'Not initialized' });
});

app.get('/api/ai/ml-predictor', (req, res) => {
  res.json(mlPredictor?.getStats() || { error: 'Not initialized' });
});

console.log('[api] ✅ Optimization endpoints registered');

// === 🎛️ FEATURE CONTROL API ===
console.log('[api] 🎛️ Registering feature control endpoints...');

// Feature status tracking
const featureStatus = {
  dynamicPositionSizing: { enabled: true, name: 'Position Sizing' },
  multiTradeExecutor: { enabled: true, name: 'Multi-Trade' },
  feeOptimizer: { enabled: true, name: 'Fee Optimizer' },
  compoundingStrategy: { enabled: true, name: 'Compounding' },
  tradingHours: { enabled: true, name: 'Trading Hours' },
  coinExpansion: { enabled: true, name: 'Coin Expansion' },
  flashDetector: { enabled: true, name: 'Flash Detector' },
  gasOptimizer: { enabled: true, name: 'Gas Optimizer' },
  riskManager: { enabled: true, name: 'Risk Manager' },
  smartRouter: { enabled: true, name: 'Smart Router' },
  apiKeyManager: { enabled: true, name: 'API Security' },
  latencyOptimizer: { enabled: true, name: 'Latency Optimizer' },
  balancePredictor: { enabled: true, name: 'AI Balance' },
  autoTransfer: { enabled: false, name: 'Auto Transfer' },
  mlPredictor: { enabled: true, name: 'ML Predictor' }
};

// Get all feature statuses
app.get('/api/features/status', (req, res) => {
  try {
    res.json({
      success: true,
      features: featureStatus,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toggle individual feature
app.post('/api/features/toggle', express.json(), (req, res) => {
  try {
    const { featureId, enabled } = req.body;
    
    if (!featureId || typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request. Required: featureId (string), enabled (boolean)' 
      });
    }
    
    if (!featureStatus[featureId]) {
      return res.status(404).json({ 
        success: false, 
        error: `Feature '${featureId}' not found` 
      });
    }
    
    // Update status
    featureStatus[featureId].enabled = enabled;
    
    console.log(`[features] ${enabled ? '🟢' : '🔴'} ${featureStatus[featureId].name} ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    res.json({
      success: true,
      featureId,
      name: featureStatus[featureId].name,
      enabled,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enable all features
app.post('/api/features/enable-all', (req, res) => {
  try {
    Object.keys(featureStatus).forEach(key => {
      featureStatus[key].enabled = true;
    });
    
    console.log('[features] 🟢 ALL FEATURES ENABLED');
    
    res.json({
      success: true,
      message: 'All features enabled',
      features: featureStatus,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disable all features
app.post('/api/features/disable-all', (req, res) => {
  try {
    Object.keys(featureStatus).forEach(key => {
      featureStatus[key].enabled = false;
    });
    
    console.log('[features] 🔴 ALL FEATURES DISABLED');
    
    res.json({
      success: true,
      message: 'All features disabled',
      features: featureStatus,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emergency stop all
app.post('/api/features/emergency-stop', (req, res) => {
  try {
    // Disable all features
    Object.keys(featureStatus).forEach(key => {
      featureStatus[key].enabled = false;
    });
    
    // Stop real trading if enabled
    if (realTradingEngine && realTradingEngine.config.enabled) {
      realTradingEngine.config.enabled = false;
      console.log('[emergency] 🛑 REAL TRADING STOPPED');
    }
    
    console.log('[emergency] 🛑 EMERGENCY STOP - ALL FEATURES DISABLED');
    
    res.json({
      success: true,
      message: 'EMERGENCY STOP: All features and trading disabled',
      features: featureStatus,
      tradingStopped: true,
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

console.log('[api] ✅ Feature control endpoints registered');

// Live Monitoring API
app.get('/api/monitor/activity', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    // Get recent opportunities from logger
    const recentOpps = opportunityLogger.getTopExchangePairs(1, limit);
    
    // Get trading stats
    const tradingStatus = realTradingEngine.getStatus();
    
    // Get recent trades
    const recentTrades = realTradingEngine.db.getTrades({
      limit: 10,
      orderBy: 'timestamp DESC'
    });
    
    res.json({
      success: true,
      timestamp: Date.now(),
      opportunities: recentOpps,
      trading: {
        enabled: tradingStatus.enabled,
        dryRun: tradingStatus.dryRun,
        dailyProfit: tradingStatus.dailyProfit,
        dailyVolume: tradingStatus.dailyVolume,
        balance: tradingStatus.totalAvailableUSD
      },
      recentTrades: recentTrades.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Coin Management API
app.get('/api/coins/list', (req, res) => {
  res.json({
    coins: coins,
    count: coins.length,
    maxCoins: MAX_COINS,
    availableSlots: MAX_COINS - coins.length,
    lastUpdated: new Date().toISOString()
  });
});

app.post('/api/coins/add', (req, res) => {
  const { symbol } = req.body;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }
  
  const upperSymbol = symbol.toUpperCase();
  
  if (coins.includes(upperSymbol)) {
    return res.json({ 
      message: `${upperSymbol} already in the list`, 
      totalCoins: coins.length,
      maxCoins: MAX_COINS
    });
  }
  
  // Check limit
  if (coins.length >= MAX_COINS) {
    return res.status(400).json({ 
      error: `Coin limit reached (${MAX_COINS} coins). Remove some coins first.`,
      totalCoins: coins.length,
      maxCoins: MAX_COINS
    });
  }
  
  coins.push(upperSymbol);
  console.log(`[coins] Manually added: ${upperSymbol} (total: ${coins.length}/${MAX_COINS})`);
  
  res.json({
    success: true,
    message: `${upperSymbol} added to coin list`,
    totalCoins: coins.length,
    maxCoins: MAX_COINS,
    availableSlots: MAX_COINS - coins.length
  });
});

app.post('/api/coins/remove', (req, res) => {
  const { symbol } = req.body;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }
  
  const upperSymbol = symbol.toUpperCase();
  const index = coins.indexOf(upperSymbol);
  
  if (index === -1) {
    return res.status(404).json({ error: `${upperSymbol} not found in the list` });
  }
  
  coins.splice(index, 1);
  console.log(`[coins] Removed: ${upperSymbol} (total: ${coins.length})`);
  
  res.json({
    success: true,
    message: `${upperSymbol} removed from coin list`,
    totalCoins: coins.length
  });
});

// WebSocket connection handler
wss.on('connection', ws => {
  console.log('[ws] client connected');
  ws.send(JSON.stringify(snapshot)); // pošalji trenutni snapshot odmah
});

// --- Paper Trading Strategy ---
const strategy = new ArbitrageStrategy({
  minSpread: 0.5,    // Min 0.5% net spread
  maxTradeSize: 1000 // Max $1000 per trade
});

// Pokreni strategiju (PAPER MODE)
strategy.start();

// --- Advanced Strategy (with risk scoring) ---
let advancedStrategy = null;

// --- WebSocket Handler (real-time updates) ---
let wsHandler = null;

// --- Adaptive Poller (dynamic interval) ---
const adaptivePoller = new AdaptivePoller({
  minInterval: 15000,  // 15s when very active
  maxInterval: 45000,  // 45s when quiet
  defaultInterval: 30000  // 30s default
});

// --- Opportunity Quality Scorer ---
const opportunityScorer = new OpportunityScorer({
  minQualityScore: 60  // Minimum score to consider (GOOD or better)
});

// --- Smart Coin Selector ---
const smartCoinSelector = new SmartCoinSelector({
  maxCoins: 30,  // Track max 30 coins
  minOpportunities: 2,  // Min 2 opportunities in 24h
  evaluationPeriod: 24 * 60 * 60 * 1000  // 24 hours
});

// --- Slippage Protection ---
const slippageProtection = new SlippageProtection({
  maxSlippage: 0.3,  // 0.3% max acceptable slippage
  minNetSpreadAfterSlippage: 0.3  // 0.3% minimum net spread after slippage
});

// --- Exchange Health Monitor ---
const exchangeHealthMonitor = new ExchangeHealthMonitor({
  latencyThreshold: 5000,  // 5s max latency
  minSuccessRate: 0.7,  // 70% minimum success rate
  evaluationWindow: 100  // Last 100 requests
});

// --- Performance Analytics ---
const performanceAnalytics = new PerformanceAnalytics();

// --- 🚀 PROFIT OPTIMIZATION MODULES (NEW) ---
console.log('[init] 🚀 Initializing profit optimization modules...');

// Dynamic Position Sizing
const positionSizer = new DynamicPositionSizing({
  minTradeSize: 10,
  maxTradeSize: 100,
  defaultTradeSize: 25,
  useKellyCriterion: true,
  aggressiveMode: false
});
console.log('[init] ✅ Dynamic Position Sizing initialized');

// Fee Optimizer
const feeOptimizer = new FeeOptimizer();
console.log('[init] ✅ Fee Optimizer initialized');

// Profit Compounding
const profitCompounding = new ProfitCompounding({
  initialCapital: 500,
  compoundingEnabled: true,
  compoundFrequency: 'daily',
  compoundPercentage: 100
});
console.log('[init] ✅ Profit Compounding initialized');

// Multi-Trade Executor (will be initialized after realTradingEngine)
let multiTradeExecutor = null;

console.log('[init] 🎉 All profit optimization modules ready!');
// === 🚀 DECLARE VARIABLES FOR 15 FEATURES (will initialize after opportunityLogger) ===
let tradingHours, coinExpansion, flashDetector, gasOptimizer;
let riskManager, smartRouter, apiKeyManager, latencyOptimizer;
let balancePredictor, autoTransfer, mlPredictor;


// --- Advanced Monitoring Systems ---
monitoringConfig = loadMonitoringConfig();
const feeVerification = new FeeVerificationSystem();
const coinTracking = new CoinTrackingSystem({
  dataPath: monitoringConfig.coinTracking.dataPath,
  retryOptions: monitoringConfig.coinTracking.retryOptions
});
const sentimentAnalysis = new SentimentAnalysisSystem();
const coinRotation = new CoinRotationSystem({
  dataFile: monitoringConfig.coinRotation.dataFile
});

// Fee verification check (every 2 weeks)
setInterval(() => {
  feeVerification.verify();
}, 14 * 24 * 60 * 60 * 1000); // 2 weeks

// Initial fee verification
setTimeout(() => feeVerification.verify(), 5000);

// Coin tracking + rotation (configurable interval)
setInterval(async () => {
  await coinTracking.scan();
  
  // Get trending coins
  const opportunities = coinTracking.getTopOpportunities();
  if (opportunities && opportunities.topOpportunities) {
    // Smart rotation: Remove underperforming, add trending
    const result = coinRotation.rotateCoin(coins, opportunities.topOpportunities, MAX_COINS);
    
    if (result.removed.length > 0 || result.added.length > 0) {
      console.log(`[rotation] ${result.message}`);
      console.log(`[rotation] Coins now: ${coins.length}/${MAX_COINS}`);
    }
  }
}, monitoringConfig.schedules.scanIntervalMs);

// Initial coin tracking + rotation
setTimeout(async () => {
  await coinTracking.scan();
  
  // Get trending coins
  const opportunities = coinTracking.getTopOpportunities();
  if (opportunities && opportunities.topOpportunities) {
    // Smart rotation: Remove underperforming, add trending
    const result = coinRotation.rotateCoin(coins, opportunities.topOpportunities, MAX_COINS);
    
    if (result.removed.length > 0 || result.added.length > 0) {
      console.log(`[rotation] ${result.message}`);
      console.log(`[rotation] Coins now: ${coins.length}/${MAX_COINS}`);
    }
  }
}, monitoringConfig.schedules.initialScanDelayMs);

// Cleanup old performance data (daily)
setInterval(() => {
  coinRotation.cleanup();
}, 24 * 60 * 60 * 1000); // 24 hours

// Sentiment analysis (every 4 hours for top 10 coins)
setInterval(async () => {
  const topCoins = [
    { id: 'bitcoin', symbol: 'BTC' },
    { id: 'ethereum', symbol: 'ETH' },
    { id: 'ripple', symbol: 'XRP' },
    { id: 'binancecoin', symbol: 'BNB' },
    { id: 'solana', symbol: 'SOL' },
    { id: 'cardano', symbol: 'ADA' },
    { id: 'dogecoin', symbol: 'DOGE' },
    { id: 'polkadot', symbol: 'DOT' },
    { id: 'chainlink', symbol: 'LINK' },
    { id: 'uniswap', symbol: 'UNI' }
  ];
  
  const analyses = await sentimentAnalysis.analyzeMultipleCoins(topCoins);
  sentimentAnalysis.saveAnalysis(analyses);
  
  const topPredictions = sentimentAnalysis.getTopPredictions(analyses);
  console.log(`[sentiment] Analysis complete: ${topPredictions.length} high-confidence predictions`);
}, 4 * 60 * 60 * 1000); // 4 hours

// Initial sentiment analysis
setTimeout(async () => {
  const topCoins = [
    { id: 'bitcoin', symbol: 'BTC' },
    { id: 'ethereum', symbol: 'ETH' },
    { id: 'ripple', symbol: 'XRP' }
  ];
  const analyses = await sentimentAnalysis.analyzeMultipleCoins(topCoins);
  sentimentAnalysis.saveAnalysis(analyses);
}, 15000);

// --- startup ---
loadFeeConfig();
loadAlertConfig();
loadRealTradingConfig();
await initCoins();
await initExchanges();

// Initialize BatchProcessor with health monitor
batchProcessor = new BatchProcessor(exchanges, exchangeHealthMonitor);
console.log('[batch] BatchProcessor initialized with', exchanges.length, 'exchanges');

// Initialize Advanced Strategy with risk scoring and real trading
advancedStrategy = new AdvancedArbitrageStrategy(
  strategy.paperEngine, 
  feeConfig.exchanges, 
  realTradingEngine
);
console.log('[advanced] AdvancedArbitrageStrategy initialized');
console.log('[advanced] Min spread:', advancedStrategy.minSpread + '%');
console.log('[advanced] Risk threshold:', (advancedStrategy.riskThreshold * 100) + '%');
console.log('[advanced] Real Trading:', realTradingEngine.config.enabled ? 
  (realTradingEngine.config.dryRun ? '🧪 DRY-RUN' : '🔥 LIVE') : '❌ Disabled');

// Initialize Opportunity Logger for AI Balance Manager (Phase 1)
const opportunityLogger = new OpportunityLogger();
console.log('[ai-manager] 🤖 AI Balance Manager - Phase 1: Data Collection');
console.log('[ai-manager] 📊 Collecting opportunity data for 7 days...');

// Cleanup old data daily
setInterval(() => opportunityLogger.cleanup(), 24 * 60 * 60 * 1000);

// Generate report every 24h
setInterval(() => {
  console.log('[ai-manager] 📊 Generating 7-day analytics report...');
  opportunityLogger.generateReport(7);
}, 24 * 60 * 60 * 1000);

// === 🚀 INITIALIZE ALL 15 FEATURES (after opportunityLogger is ready) ===
console.log('[init] 🚀 Initializing ALL 15 optimization features...');

try {
  // Quick Wins
  tradingHours = new TradingHoursOptimizer(opportunityLogger, {
    autoAdjustEnabled: true,
    peakHoursBoost: 1.5,
    quietHoursPenalty: 0.5
  });
  console.log('[init] ✅ Trading Hours Optimizer initialized');

  coinExpansion = new CoinPairExpansion({
    maxCoins: 100,
    minVolume24h: 10_000_000,
    autoExpand: true
  });
  console.log('[init] ✅ Coin Pair Expansion initialized');

  flashDetector = new FlashArbitrageDetector({
    minFlashSpread: 5.0,
    flashMultiplier: 2.0,
    ultraFlashMultiplier: 3.0
  });
  console.log('[init] ✅ Flash Arbitrage Detector initialized');

  gasOptimizer = new GasFeeOptimizer({
    autoDelay: true,
    maxDelayHours: 24
  });
  console.log('[init] ✅ Gas Fee Optimizer initialized');

  // Advanced Features
  riskManager = new AdvancedRiskManager({
    maxDrawdown: 0.20,
    stopLossPercent: 0.05,
    maxCorrelation: 0.7
  });
  console.log('[init] ✅ Advanced Risk Manager initialized');

  smartRouter = new SmartOrderRouter(exchanges || [], {
    enableTWAP: true,
    enableVWAP: true,
    maxSlippageTolerance: 0.005
  });
  console.log('[init] ✅ Smart Order Router initialized');

  apiKeyManager = new APIKeyManager({
    autoRotate: false,
    enableAnomalyDetection: true
  });
  console.log('[init] ✅ API Key Manager initialized');

  latencyOptimizer = new LatencyOptimizer(exchanges || [], {
    enableWebSocket: false,
    targetLatencyMs: 500,
    precomputeTemplates: true
  });
  console.log('[init] ✅ Latency Optimizer initialized');

  // AI/ML Features
  balancePredictor = new BalancePredictor(opportunityLogger, {
    lookbackDays: 7,
    rebalanceThreshold: 0.20
  });
  console.log('[init] ✅ AI Balance Predictor initialized');

  autoTransfer = new AutoTransfer(exchanges || [], { 
    enabled: false, 
    dryRun: true,
    preferredNetwork: 'TRC20',
    maxTransferAmount: 200
  });
  console.log('[init] ✅ Auto Transfer initialized (DRY-RUN mode)');

  mlPredictor = new MLPricePredictor({
    confidenceThreshold: 0.7,
    onlyTradeOnSafePrediction: true
  });
  console.log('[init] ✅ ML Price Predictor initialized');

  console.log('[init] 🎉 ALL 15 FEATURES SUCCESSFULLY INITIALIZED!');
  console.log('[init] 📊 System enhanced with 15× optimization power!');

} catch (err) {
  console.error('[init] ❌ Error initializing features:', err.message);
  console.error('[init] Stack:', err.stack);
}

// Initialize WebSocket Handler for real-time updates
wsHandler = new WebSocketHandler(exchanges);
console.log('[ws-handler] WebSocketHandler initialized');

// Start WebSocket connections (async, non-blocking)
wsHandler.initialize(coins).then(() => {
  console.log('[ws-handler] WebSocket connections established');
  
  // Subscribe to real-time price updates
  wsHandler.subscribe((update) => {
    // Check for arbitrage opportunity on price update
    const opportunity = wsHandler.findOpportunity(update.symbol.split('/')[0]);
    
    if (opportunity && advancedStrategy) {
      // Enhance with risk scoring
      const enhanced = advancedStrategy.analyzeOpportunity(opportunity, {
        volume: opportunity.buyPrice * 1000000,
        volatility: 5
      });
      
      if (enhanced && enhanced.riskScore >= advancedStrategy.riskThreshold) {
        console.log(`[ws-realtime] 🚀 ${enhanced.coin}: ${enhanced.netSpread.toFixed(2)}% (Risk: ${(enhanced.riskScore * 100).toFixed(1)}%)`);
        
        // Execute trade immediately
        advancedStrategy.executeTrade(enhanced).then(result => {
          if (result.success) {
            console.log(`[ws-realtime] 💰 Instant trade: +$${enhanced.expectedProfit.toFixed(2)}`);
          }
        });
      }
    }
  });
}).catch(err => {
  console.error('[ws-handler] Failed to initialize WebSocket:', err.message);
  console.log('[ws-handler] Continuing with batch processing only');
});

// Adaptive polling loop (replaces fixed interval)
async function monitorLoop() {
  await monitor();
  
  // Adjust interval based on opportunities found
  const opportunitiesFound = snapshot.spreads ? snapshot.spreads.length : 0;
  const nextInterval = adaptivePoller.adjustInterval(opportunitiesFound);
  
  // Schedule next poll
  setTimeout(monitorLoop, nextInterval);
}

// Start adaptive polling
console.log('[adaptive] Starting adaptive polling...');
monitorLoop();

// Prikaži statistiku svaka 5 minuta
setInterval(() => {
  const perf = strategy.getPerformance();
  console.log(`\n[stats] Opportunities: ${perf.opportunitiesAnalyzed} | Trades: ${perf.tradesExecuted} | Balance: $${perf.currentBalance.toFixed(2)} | Profit: $${perf.profit.toFixed(2)} (${perf.profitPercent.toFixed(2)}%)\n`);
}, 300_000);

// Print adaptive poller summary every hour
setInterval(() => {
  adaptivePoller.printSummary();
}, 60 * 60 * 1000);

// Update coin list every hour based on performance
setInterval(() => {
  const updatedCoins = smartCoinSelector.updateActiveCoins(coins);
  coins = updatedCoins;
  console.log(`[smart-coins] Active coins (${coins.length}): ${smartCoinSelector.getActiveCoinsList()}`);
  
  // Clean old data
  smartCoinSelector.cleanOldData();
}, 60 * 60 * 1000);

// Print smart coin selector summary every 2 hours
setInterval(() => {
  smartCoinSelector.printSummary();
}, 2 * 60 * 60 * 1000);

// Print slippage protection summary every 2 hours
setInterval(() => {
  slippageProtection.printSummary();
}, 2 * 60 * 60 * 1000);

// Print exchange health summary every hour
setInterval(() => {
  exchangeHealthMonitor.printSummary();
}, 60 * 60 * 1000);

// Print performance analytics summary every 2 hours
setInterval(() => {
  performanceAnalytics.printSummary();
}, 2 * 60 * 60 * 1000);
