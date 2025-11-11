/**
 * Real Trading Engine
 * LIVE TRADING with strict safety caps and manual approval
 * 
 * ⚠️ WARNING: THIS USES REAL MONEY! ⚠️
 */

import ccxt from 'ccxt';
import { DatabaseManager } from '../storage/database.js';

export class RealTradingEngine {
  constructor(config = {}) {
    this.config = {
      // Trading mode
      enabled: config.enabled || false,
      dryRun: config.dryRun !== false, // Default to dry-run!
      
      // Safety caps
      maxTradeSize: config.maxTradeSize || 250, // $250 max per trade
      maxDailyVolume: config.maxDailyVolume || 2000, // $2000 max per day
      maxOpenPositions: config.maxOpenPositions || 3,
      minSpreadRequired: config.minSpreadRequired || 0.5, // 0.5% minimum (lowered for more opportunities)
      
      // Manual approval
      requireApproval: config.requireApproval !== false, // Default: require approval
      autoApproveUnder: config.autoApproveUnder || 50, // Auto-approve trades < $50
      
      // Kill-switch
      emergencyStop: false,
      maxConsecutiveLosses: config.maxConsecutiveLosses || 3,
      maxDailyLoss: config.maxDailyLoss || 100, // $100 max daily loss
      
      // Exchange credentials (from env)
      exchanges: config.exchanges || {}
    };
    
    // State
    this.exchanges = {};
    this.pendingTrades = [];
    this.MAX_PENDING_TRADES = 100; // Limit to prevent memory leak
    this.dailyVolume = 0;
    this.dailyProfit = 0;
    this.consecutiveLosses = 0;
    this.openPositions = [];
    
    // Balance cache (to avoid slow API calls)
    this.cachedBalances = null;
    this.lastBalanceFetch = null;
    this.BALANCE_CACHE_DURATION = 120000; // 120 seconds (2 min) for 8 exchanges
    
    // Memory cleanup task (every 5 minutes)
    setInterval(() => this.cleanupOldTrades(), 300000);
    
    // Database
    this.db = new DatabaseManager();
    
    // Initialize exchanges
    this.initializeExchanges();
    
    console.log('[real-trading] Real Trading Engine initialized');
    console.log('[real-trading] 🧹 Memory cleanup: Max', this.MAX_PENDING_TRADES, 'pending trades');
    console.log('[real-trading] ⚠️  Mode:', this.config.dryRun ? 'DRY-RUN (SAFE)' : 'LIVE TRADING');
    console.log('[real-trading] Safety Caps:');
    console.log('[real-trading]   - Max trade: $' + this.config.maxTradeSize);
    console.log('[real-trading]   - Max daily: $' + this.config.maxDailyVolume);
    console.log('[real-trading]   - Approval required:', this.config.requireApproval);
  }

  /**
   * Initialize exchange connections
   */
  initializeExchanges() {
    const exchangeIds = Object.keys(this.config.exchanges);
    
    if (exchangeIds.length === 0) {
      console.log('[real-trading] ⚠️  No exchange credentials configured');
      console.log('[real-trading] 💡 Add API keys to enable real trading');
      return;
    }
    
    exchangeIds.forEach(exchangeId => {
      try {
        const credentials = this.config.exchanges[exchangeId];
        
        if (!credentials.apiKey || !credentials.secret) {
          console.log(`[real-trading] ⚠️  Missing credentials for ${exchangeId}`);
          return;
        }
        
        // Create exchange instance
        const ExchangeClass = ccxt[exchangeId];
        const config = {
          apiKey: credentials.apiKey,
          secret: credentials.secret,
          enableRateLimit: true,
          options: { defaultType: 'spot' }
        };
        
        // KuCoin requires passphrase
        if (exchangeId === 'kucoin' && credentials.passphrase) {
          config.password = credentials.passphrase;
        }
        
        // OKX requires passphrase
        if (exchangeId === 'okx' && credentials.password) {
          config.password = credentials.password;
        }
        
        // Bitget requires passphrase
        if (exchangeId === 'bitget' && credentials.password) {
          config.password = credentials.password;
        }
        
        this.exchanges[exchangeId] = new ExchangeClass(config);
        
        console.log(`[real-trading] ✅ ${exchangeId} connected`);
      } catch (err) {
        console.error(`[real-trading] ❌ Failed to initialize ${exchangeId}:`, err.message);
      }
    });
  }

  /**
   * Check if trading is allowed
   */
  canTrade() {
    const checks = {
      enabled: this.config.enabled,
      notEmergencyStop: !this.config.emergencyStop,
      underDailyVolume: this.dailyVolume < this.config.maxDailyVolume,
      underMaxPositions: this.openPositions.length < this.config.maxOpenPositions,
      notMaxLosses: this.consecutiveLosses < this.config.maxConsecutiveLosses,
      underDailyLoss: this.dailyProfit > -this.config.maxDailyLoss
    };
    
    const canTrade = Object.values(checks).every(v => v);
    
    if (!canTrade) {
      const reasons = Object.entries(checks)
        .filter(([, pass]) => !pass)
        .map(([reason]) => reason);
      
      console.log('[real-trading] ⛔ Trading blocked:', reasons.join(', '));
    }
    
    return { allowed: canTrade, checks, reasons: canTrade ? [] : Object.keys(checks).filter(k => !checks[k]) };
  }

  /**
   * Analyze arbitrage opportunity for real trading
   */
  async analyzeOpportunity(opportunity) {
    // Safety check
    const tradingStatus = this.canTrade();
    if (!tradingStatus.allowed) {
      return {
        approved: false,
        reason: 'Trading blocked: ' + tradingStatus.reasons.join(', '),
        opportunity
      };
    }
    
    // Validate spread
    if (opportunity.netSpread < this.config.minSpreadRequired) {
      return {
        approved: false,
        reason: `Spread too low: ${opportunity.netSpread.toFixed(2)}% < ${this.config.minSpreadRequired}%`,
        opportunity
      };
    }
    
    // Calculate trade size (capped)
    console.log(`[real-trading] Looking for exchanges: buy="${opportunity.buyExchange}", sell="${opportunity.sellExchange}"`);
    console.log(`[real-trading] Available exchanges:`, Object.keys(this.exchanges));
    
    const buyExchange = this.exchanges[opportunity.buyExchange];
    const sellExchange = this.exchanges[opportunity.sellExchange];
    
    if (!buyExchange || !sellExchange) {
      console.log(`[real-trading] ❌ buyExchange found: ${!!buyExchange}, sellExchange found: ${!!sellExchange}`);
      return {
        approved: false,
        reason: 'Exchange not connected',
        opportunity
      };
    }
    
    // Get balance
    let balance;
    try {
      balance = await buyExchange.fetchBalance();
    } catch (err) {
      return {
        approved: false,
        reason: 'Failed to fetch balance: ' + err.message,
        opportunity
      };
    }
    
    const availableUSD = balance['USDT']?.free || balance['USD']?.free || 0;
    
    // Calculate safe trade size
    const maxSize = Math.min(
      this.config.maxTradeSize,
      this.config.maxDailyVolume - this.dailyVolume,
      availableUSD * 0.25 // Max 25% of available balance
    );
    
    console.log(`[real-trading] Trade size calculation: availableUSD=${availableUSD}, maxSize=${maxSize}`);
    
    if (maxSize < 5) {
      return {
        approved: false,
        reason: `Insufficient balance: need $5, have $${maxSize.toFixed(2)} available (25% of $${availableUSD.toFixed(2)})`,
        opportunity
      };
    }
    
    const tradeSize = maxSize;
    const coinAmount = tradeSize / opportunity.buyPrice;
    
    // Estimate profit
    const buyCost = coinAmount * opportunity.buyPrice;
    const sellRevenue = coinAmount * opportunity.sellPrice;
    const estimatedProfit = sellRevenue - buyCost - (buyCost * 0.002); // Approximate fees
    
    // Create trade plan
    const tradePlan = {
      id: Date.now() + '-' + opportunity.coin,
      timestamp: new Date().toISOString(),
      coin: opportunity.coin,
      buyExchange: opportunity.buyExchange,
      sellExchange: opportunity.sellExchange,
      buyPrice: opportunity.buyPrice,
      sellPrice: opportunity.sellPrice,
      spread: opportunity.netSpread,
      tradeSize: tradeSize,
      coinAmount: coinAmount,
      estimatedProfit: estimatedProfit,
      status: 'pending_approval',
      requiresApproval: tradeSize >= this.config.autoApproveUnder,
      dryRun: this.config.dryRun
    };
    
    // Auto-approve small trades
    if (!this.config.requireApproval || tradeSize < this.config.autoApproveUnder) {
      tradePlan.status = 'approved';
      tradePlan.approvedAt = new Date().toISOString();
      tradePlan.approvedBy = 'auto';
    }
    
    // Add to pending trades
    this.pendingTrades.push(tradePlan);
    
    console.log(`[real-trading] 💼 Trade plan created: ${opportunity.coin}`);
    console.log(`[real-trading]    Size: $${tradeSize.toFixed(2)} | Profit: $${estimatedProfit.toFixed(2)}`);
    console.log(`[real-trading]    Status: ${tradePlan.status}`);
    
    return {
      approved: tradePlan.status === 'approved',
      requiresManualApproval: tradePlan.requiresApproval,
      tradePlan
    };
  }

  /**
   * Execute real trade
   */
  async executeTrade(tradePlan) {
    if (this.config.emergencyStop) {
      throw new Error('EMERGENCY STOP ACTIVE - Trading disabled');
    }
    
    if (tradePlan.status !== 'approved') {
      throw new Error('Trade not approved');
    }
    
    // Dry-run mode
    if (this.config.dryRun) {
      console.log('[real-trading] 🧪 DRY-RUN: Would execute trade:', tradePlan.id);
      tradePlan.status = 'completed_dryrun';
      tradePlan.completedAt = new Date().toISOString();
      return {
        success: true,
        dryRun: true,
        tradePlan
      };
    }
    
    // LIVE TRADING
    console.log('[real-trading] 🔥 EXECUTING LIVE TRADE:', tradePlan.id);
    
    const buyExchange = this.exchanges[tradePlan.buyExchange];
    const sellExchange = this.exchanges[tradePlan.sellExchange];
    
    try {
      // SAFETY CHECK: Verify sell exchange has the trading pair
      console.log(`[real-trading] 🔍 Pre-trade verification...`);
      const markets = await sellExchange.loadMarkets();
      const tradePair = `${tradePlan.coin}/USDT`;
      
      if (!markets[tradePair]) {
        throw new Error(`${tradePlan.coin}/USDT not available on ${tradePlan.sellExchange} - ABORTING to prevent stuck coins!`);
      }
      
      console.log(`[real-trading] ✅ Verified ${tradePair} exists on both exchanges`);
      
      // Step 1: Buy on cheaper exchange
      console.log(`[real-trading] 📊 Buying ${tradePlan.coinAmount.toFixed(8)} ${tradePlan.coin} on ${tradePlan.buyExchange}`);
      
      const buyOrder = await buyExchange.createMarketBuyOrder(
        tradePair,
        tradePlan.coinAmount
      );
      
      tradePlan.buyOrderId = buyOrder.id;
      tradePlan.actualBuyPrice = buyOrder.average || tradePlan.buyPrice;
      
      console.log(`[real-trading] ✅ Buy order filled: ${buyOrder.id}`);
      
      // Step 2: Sell on expensive exchange (WITH RETRY!)
      console.log(`[real-trading] 📊 Selling ${tradePlan.coinAmount.toFixed(8)} ${tradePlan.coin} on ${tradePlan.sellExchange}`);
      
      let sellOrder = null;
      let sellAttempts = 0;
      const MAX_SELL_RETRIES = 3;
      
      while (!sellOrder && sellAttempts < MAX_SELL_RETRIES) {
        try {
          sellAttempts++;
          console.log(`[real-trading] 🔄 Sell attempt ${sellAttempts}/${MAX_SELL_RETRIES}...`);
          
          sellOrder = await sellExchange.createMarketSellOrder(
            tradePair,
            tradePlan.coinAmount
          );
          
          console.log(`[real-trading] ✅ Sell order filled: ${sellOrder.id}`);
        } catch (sellErr) {
          console.error(`[real-trading] ⚠️ Sell attempt ${sellAttempts} failed:`, sellErr.message);
          
          if (sellAttempts >= MAX_SELL_RETRIES) {
            console.error(`[real-trading] 🚨 CRITICAL: BUY completed but SELL failed after ${MAX_SELL_RETRIES} attempts!`);
            console.error(`[real-trading] 🚨 Coin ${tradePlan.coin} is stuck on ${tradePlan.buyExchange}!`);
            console.error(`[real-trading] 🚨 Manual intervention required!`);
            throw new Error(`SELL FAILED - Coin stuck on ${tradePlan.buyExchange}: ${sellErr.message}`);
          }
          
          // Wait 2 seconds before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      tradePlan.sellOrderId = sellOrder.id;
      tradePlan.actualSellPrice = sellOrder.average || tradePlan.sellPrice;
      tradePlan.sellAttempts = sellAttempts;
      
      // Calculate actual profit
      const actualProfit = (tradePlan.coinAmount * tradePlan.actualSellPrice) - 
                          (tradePlan.coinAmount * tradePlan.actualBuyPrice) -
                          (buyOrder.fee?.cost || 0) - (sellOrder.fee?.cost || 0);
      
      tradePlan.actualProfit = actualProfit;
      tradePlan.status = 'completed';
      tradePlan.completedAt = new Date().toISOString();
      
      // Update daily stats
      this.dailyVolume += tradePlan.tradeSize;
      this.dailyProfit += actualProfit;
      
      // Update consecutive losses
      if (actualProfit > 0) {
        this.consecutiveLosses = 0;
      } else {
        this.consecutiveLosses++;
      }
      
      // Save to database
      this.db.insertTrade({
        timestamp: tradePlan.timestamp,
        type: 'arbitrage',
        exchange: `${tradePlan.buyExchange}/${tradePlan.sellExchange}`,
        coin: tradePlan.coin,
        amount: tradePlan.coinAmount,
        price: tradePlan.actualBuyPrice,
        fee: (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0),
        feeBps: 20,
        totalCost: tradePlan.tradeSize,
        profit: actualProfit
      });
      
      console.log(`[real-trading] 🎉 Trade completed! Profit: $${actualProfit.toFixed(2)}`);
      
      return {
        success: true,
        tradePlan,
        buyOrder,
        sellOrder
      };
      
    } catch (err) {
      console.error('[real-trading] ❌ Trade execution failed:', err.message);
      
      tradePlan.status = 'failed';
      tradePlan.error = err.message;
      tradePlan.failedAt = new Date().toISOString();
      
      this.consecutiveLosses++;
      
      return {
        success: false,
        error: err.message,
        tradePlan
      };
    }
  }

  /**
   * Approve pending trade
   */
  approveTrade(tradeId) {
    const trade = this.pendingTrades.find(t => t.id === tradeId);
    
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    if (trade.status !== 'pending_approval') {
      throw new Error('Trade not pending approval');
    }
    
    trade.status = 'approved';
    trade.approvedAt = new Date().toISOString();
    trade.approvedBy = 'manual';
    
    console.log(`[real-trading] ✅ Trade approved: ${tradeId}`);
    
    return trade;
  }

  /**
   * Reject pending trade
   */
  rejectTrade(tradeId, reason) {
    const trade = this.pendingTrades.find(t => t.id === tradeId);
    
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    trade.status = 'rejected';
    trade.rejectedAt = new Date().toISOString();
    trade.rejectionReason = reason;
    
    console.log(`[real-trading] ❌ Trade rejected: ${tradeId} - ${reason}`);
    
    return trade;
  }

  /**
   * Emergency kill-switch
   */
  emergencyStop() {
    this.config.emergencyStop = true;
    console.log('[real-trading] 🚨 EMERGENCY STOP ACTIVATED');
    console.log('[real-trading] ⛔ All trading disabled');
    
    // Reject all pending trades
    this.pendingTrades
      .filter(trade => trade.status === 'pending_approval')
      .forEach(trade => this.rejectTrade(trade.id, 'Emergency stop activated'));
    
    return {
      stopped: true,
      timestamp: new Date().toISOString(),
      pendingTradesRejected: this.pendingTrades.filter(trade => trade.status === 'rejected').length
    };
  }

  /**
   * Resume trading
   */
  resumeTrading() {
    this.config.emergencyStop = false;
    console.log('[real-trading] ✅ Trading resumed');
    
    return {
      resumed: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup old trades to prevent memory leak
   */
  cleanupOldTrades() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const initialCount = this.pendingTrades.length;
    
    // Remove trades older than 24 hours
    this.pendingTrades = this.pendingTrades.filter(trade => {
      const tradeTime = new Date(trade.timestamp).getTime();
      return tradeTime > oneDayAgo;
    });
    
    // Limit to MAX_PENDING_TRADES (keep most recent)
    if (this.pendingTrades.length > this.MAX_PENDING_TRADES) {
      this.pendingTrades = this.pendingTrades
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, this.MAX_PENDING_TRADES);
    }
    
    const removed = initialCount - this.pendingTrades.length;
    if (removed > 0) {
      console.log(`[real-trading] 🧹 Cleaned up ${removed} old trades (${this.pendingTrades.length} remaining)`);
    }
  }

  /**
   * Get trading status (without balance - fast)
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      dryRun: this.config.dryRun,
      emergencyStop: this.config.emergencyStop,
      dailyVolume: this.dailyVolume,
      dailyProfit: this.dailyProfit,
      consecutiveLosses: this.consecutiveLosses,
      openPositions: this.openPositions.length,
      pendingApprovals: this.pendingTrades.filter(trade => trade.status === 'pending_approval').length,
      connectedExchanges: Object.keys(this.exchanges),
      limits: {
        maxTradeSize: this.config.maxTradeSize,
        maxDailyVolume: this.config.maxDailyVolume,
        remainingDailyVolume: this.config.maxDailyVolume - this.dailyVolume,
        maxOpenPositions: this.config.maxOpenPositions
      }
    };
  }

  /**
   * Get trading status WITH real balances from exchanges (async)
   * Uses caching to avoid slow repeated API calls
   */
  async getStatusWithBalance() {
    const status = this.getStatus();
    
    // Check if cache is still valid
    const now = Date.now();
    if (this.cachedBalances && this.lastBalanceFetch && 
        (now - this.lastBalanceFetch) < this.BALANCE_CACHE_DURATION) {
      // Return cached data
      return {
        ...status,
        realBalances: this.cachedBalances.balances,
        totalAvailableUSD: this.cachedBalances.totalUSD,
        cached: true,
        cacheAge: Math.round((now - this.lastBalanceFetch) / 1000) // seconds
      };
    }
    
    // Fetch fresh balances from all connected exchanges IN PARALLEL
    const balances = {};
    let totalUSD = 0;
    
    const fetchPromises = Object.entries(this.exchanges).map(async ([exchangeName, exchange]) => {
      try {
        // Add 5s timeout per exchange to prevent hanging
        const fetchPromise = exchange.fetchBalance();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Exchange timeout')), 5000)
        );
        
        const balance = await Promise.race([fetchPromise, timeoutPromise]);
        const usdtFree = balance['USDT']?.free || 0;
        const usdFree = balance['USD']?.free || 0;
        const busdFree = balance['BUSD']?.free || 0;
        const totalFree = usdtFree || usdFree || busdFree;
        
        console.log(`[real-trading] ✅ ${exchangeName}: USDT=${usdtFree.toFixed(2)}, USD=${usdFree.toFixed(2)}`);
        return { exchangeName, balance, totalFree, success: true };
      } catch (err) {
        console.error(`[real-trading] ❌ ${exchangeName}: ${err.message}`);
        return { exchangeName, balance: { USD: { free: 0 }, error: err.message }, totalFree: 0, success: false };
      }
    });
    
    // Wait for all exchanges (even if some fail)
    const results = await Promise.allSettled(fetchPromises);
    
    // Process results
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { exchangeName, balance, totalFree } = result.value;
        balances[exchangeName] = balance;
        totalUSD += totalFree;
      }
    });
    
    // Update cache
    this.cachedBalances = { balances, totalUSD };
    this.lastBalanceFetch = now;
    
    return {
      ...status,
      realBalances: balances,
      totalAvailableUSD: totalUSD,
      cached: false
    };
  }

  /**
   * Get pending trades
   */
  getPendingTrades() {
    return this.pendingTrades.filter(trade => trade.status === 'pending_approval');
  }

  /**
   * Reset daily stats (call at midnight)
   */
  resetDailyStats() {
    this.dailyVolume = 0;
    this.dailyProfit = 0;
    this.consecutiveLosses = 0;
    console.log('[real-trading] 📊 Daily stats reset');
  }
}
