/**
 * Advanced Arbitrage Strategy
 * - Multi-hop arbitrage (triangular)
 * - Volume-weighted opportunities
 * - Risk scoring
 * - Dynamic fee calculation
 */

export class AdvancedArbitrageStrategy {
  constructor(paperEngine, feeConfig, realTradingEngine = null) {
    this.paperEngine = paperEngine;
    this.realTradingEngine = realTradingEngine;
    this.feeConfig = feeConfig;
    this.minSpread = 0.3; // 0.3% minimum (optimized for real opportunities)
    this.maxTradeSize = 1000; // $1000 max
    this.riskThreshold = 0.15; // 15% confidence minimum (lowered to accept more opportunities)
  }

  /**
   * Analyze opportunity with advanced metrics
   * @param {Object} opportunity - Basic arbitrage opportunity
   * @param {Object} marketData - Additional market data
   * @returns {Object} Enhanced opportunity with risk score
   */
  analyzeOpportunity(opportunity, marketData = {}) {
    // Calculate fees
    const buyFee = this.getFee(opportunity.buyMarket, 'taker');
    const sellFee = this.getFee(opportunity.sellMarket, 'taker');
    const totalFee = buyFee + sellFee;
    
    // Net spread after fees
    const netSpread = opportunity.grossSpread - totalFee;
    
    if (netSpread < this.minSpread) {
      return null; // Not profitable
    }
    
    // Calculate risk score (0-1)
    const riskScore = this.calculateRiskScore(opportunity, marketData);
    
    if (riskScore < this.riskThreshold) {
      console.log(`[advanced] ⚠️ ${opportunity.coin}: Risk too low ${(riskScore * 100).toFixed(1)}% < ${(this.riskThreshold * 100)}%`);
      return null; // Too risky
    }
    
    // Calculate optimal trade size
    const tradeSize = this.calculateTradeSize(opportunity, marketData);
    
    // Expected profit
    const expectedProfit = (netSpread / 100) * tradeSize;
    
    return {
      ...opportunity,
      buyFee,
      sellFee,
      totalFee,
      netSpread,
      riskScore,
      tradeSize,
      expectedProfit,
      confidence: riskScore * 100
    };
  }

  /**
   * Calculate risk score based on multiple factors
   * @param {Object} opportunity - Arbitrage opportunity
   * @param {Object} marketData - Market data
   * @returns {number} Risk score (0-1)
   */
  calculateRiskScore(opportunity, marketData) {
    let score = 1.0;
    
    // Factor 1: Spread size (larger = safer)
    const spreadFactor = Math.min(opportunity.grossSpread / 5, 1); // 5% = max
    score *= 0.3 + (spreadFactor * 0.7);
    
    // Factor 2: Exchange reliability
    const buyReliability = this.getExchangeReliability(opportunity.buyMarket);
    const sellReliability = this.getExchangeReliability(opportunity.sellMarket);
    score *= (buyReliability + sellReliability) / 2;
    
    // Factor 3: Volume (higher = safer)
    if (marketData.volume) {
      const volumeFactor = Math.min(marketData.volume / 1000000, 1); // $1M = max
      score *= 0.5 + (volumeFactor * 0.5);
    }
    
    // Factor 4: Price stability (lower volatility = safer)
    if (marketData.volatility) {
      const volatilityPenalty = Math.min(marketData.volatility / 10, 0.3); // Max 30% penalty
      score *= (1 - volatilityPenalty);
    }
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get exchange reliability score
   * @param {string} exchange - Exchange ID
   * @returns {number} Reliability (0-1)
   */
  getExchangeReliability(exchange) {
    const tier1 = ['binance', 'kraken', 'coinbase', 'bitfinex', 'okx'];
    const tier2 = ['kucoin', 'bybit', 'gateio', 'huobi', 'gemini'];
    
    if (tier1.includes(exchange)) return 1.0;
    if (tier2.includes(exchange)) return 0.85;
    return 0.7;
  }

  /**
   * Calculate optimal trade size
   * @param {Object} opportunity - Arbitrage opportunity
   * @param {Object} marketData - Market data
   * @returns {number} Trade size in USD
   */
  calculateTradeSize(opportunity, marketData = {}) {
    let size = this.maxTradeSize;
    
    // Reduce size for lower spreads
    if (opportunity.grossSpread < 1) {
      size *= 0.5; // 50% of max for <1% spread
    }
    
    // Reduce size for lower volume coins
    if (marketData.volume && marketData.volume < 100000) {
      size *= 0.3; // 30% of max for low volume
    }
    
    // Reduce size for risky exchanges
    const buyReliability = this.getExchangeReliability(opportunity.buyMarket);
    const sellReliability = this.getExchangeReliability(opportunity.sellMarket);
    const avgReliability = (buyReliability + sellReliability) / 2;
    size *= avgReliability;
    
    return Math.round(size);
  }

  /**
   * Get fee for exchange
   * @param {string} exchange - Exchange ID
   * @param {string} type - 'maker' or 'taker'
   * @returns {number} Fee percentage
   */
  getFee(exchange, type = 'taker') {
    const exchangeFee = this.feeConfig[exchange];
    if (!exchangeFee) return 0.2; // Default 0.2%
    
    return exchangeFee[type] || exchangeFee.taker || 0.2;
  }

  /**
   * Execute arbitrage trade (paper mode or real trading)
   * @param {Object} opportunity - Enhanced opportunity
   * @returns {Object} Trade result
   */
  async executeTrade(opportunity) {
    if (!opportunity || opportunity.netSpread < this.minSpread) {
      return { success: false, reason: 'Spread too low' };
    }
    
    if (opportunity.riskScore < this.riskThreshold) {
      return { success: false, reason: 'Risk too high' };
    }
    
    // Check if real trading is enabled
    if (this.realTradingEngine && this.realTradingEngine.config.enabled) {
      console.log('[advanced] 🔥 Real Trading Mode - Analyzing opportunity...');
      
      // Analyze with Real Trading Engine
      const analysis = await this.realTradingEngine.analyzeOpportunity({
        coin: opportunity.coin,
        buyExchange: opportunity.buyM || opportunity.buyMarket,
        sellExchange: opportunity.sellM || opportunity.sellMarket,
        buyPrice: opportunity.buyP || opportunity.buyPrice,
        sellPrice: opportunity.sellP || opportunity.sellPrice,
        netSpread: opportunity.netSpread,
        expectedProfit: opportunity.expectedProfit
      });
      
      if (analysis.approved) {
        console.log('[advanced] ✅ Trade approved - Executing...');
        const result = await this.realTradingEngine.executeTrade(analysis.tradePlan);
        return result;
      } else if (analysis.requiresManualApproval) {
        console.log('[advanced] ⏳ Trade requires manual approval');
        return { success: false, reason: 'Awaiting manual approval', tradePlan: analysis.tradePlan };
      } else {
        console.log('[advanced] ❌ Trade rejected:', analysis.reason);
        return { success: false, reason: analysis.reason };
      }
    }
    
    // Fallback to paper trading
    console.log('[advanced] 📝 Paper Trading Mode');
    const result = await this.paperEngine.executeTrade({
      coin: opportunity.coin,
      buyExchange: opportunity.buyMarket,
      sellExchange: opportunity.sellMarket,
      buyPrice: opportunity.buyPrice,
      sellPrice: opportunity.sellPrice,
      amount: opportunity.tradeSize,
      expectedProfit: opportunity.expectedProfit
    });
    
    return result;
  }

  /**
   * Find triangular arbitrage opportunities
   * @param {Object} batchData - Market data from all exchanges
   * @param {Array} coins - List of coins
   * @returns {Array} Triangular opportunities
   */
  findTriangularArbitrage(batchData, coins) {
    const opportunities = [];
    const exchangeCount = batchData ? Object.keys(batchData).length : 0;
    const consideredCoins = Array.isArray(coins) ? coins.length : 0;

    if (exchangeCount < 2 || consideredCoins < 3) {
      return opportunities;
    }

    // Example: BTC -> ETH -> XRP -> BTC
    // This is complex and requires more market data
    // For now, return empty array (future implementation)
    
    return opportunities;
  }

  /**
   * Get strategy statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      minSpread: this.minSpread,
      maxTradeSize: this.maxTradeSize,
      riskThreshold: this.riskThreshold,
      totalTrades: this.paperEngine.getTrades().length,
      balance: this.paperEngine.getBalance()
    };
  }

  /**
   * Update strategy parameters
   * @param {Object} params - New parameters
   */
  updateParams(params) {
    if (params.minSpread !== undefined) {
      this.minSpread = params.minSpread;
    }
    if (params.maxTradeSize !== undefined) {
      this.maxTradeSize = params.maxTradeSize;
    }
    if (params.riskThreshold !== undefined) {
      this.riskThreshold = params.riskThreshold;
    }
  }
}
