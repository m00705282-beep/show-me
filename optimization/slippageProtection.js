/**
 * Slippage Protection System
 * Estimates and protects against slippage in arbitrage trades
 */

export class SlippageProtection {
  constructor(options = {}) {
    this.maxSlippage = options.maxSlippage || 0.3;  // 0.3% max acceptable slippage
    this.minNetSpreadAfterSlippage = options.minNetSpreadAfterSlippage || 0.3;  // 0.3% minimum
    
    // Coin liquidity tiers (affects slippage)
    this.liquidityTiers = {
      veryHigh: ['BTC', 'ETH'],  // Very low slippage
      high: ['BNB', 'XRP', 'ADA', 'SOL', 'DOGE'],  // Low slippage
      medium: ['DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'LTC', 'BCH', 'ATOM', 'XLM'],  // Medium slippage
      low: []  // Everything else - high slippage
    };
    
    // Exchange liquidity tiers
    this.exchangeLiquidity = {
      veryHigh: ['binance', 'coinbase', 'kraken'],
      high: ['bitfinex', 'kucoin', 'okx', 'bybit'],
      medium: ['gateio', 'huobi', 'gemini', 'mexc', 'bitget'],
      low: []  // Everything else
    };
    
    // Stats
    this.stats = {
      totalChecked: 0,
      rejected: 0,
      accepted: 0,
      avgSlippage: 0,
      totalSlippage: 0,
      tradeSizeReductions: 0
    };
  }

  /**
   * Estimate slippage for a trade
   * @param {string} coin - Coin symbol
   * @param {string} buyExchange - Buy exchange
   * @param {string} sellExchange - Sell exchange
   * @param {number} tradeSize - Trade size in USD
   * @returns {Object} Slippage estimation
   */
  estimateSlippage(coin, buyExchange, sellExchange, tradeSize) {
    // Base slippage by coin liquidity
    const coinSlippage = this.getCoinSlippage(coin);
    
    // Exchange slippage
    const buyExchangeSlippage = this.getExchangeSlippage(buyExchange);
    const sellExchangeSlippage = this.getExchangeSlippage(sellExchange);
    const avgExchangeSlippage = (buyExchangeSlippage + sellExchangeSlippage) / 2;
    
    // Trade size impact
    const sizeImpact = this.getTradeSizeImpact(tradeSize, coin);
    
    // Combined slippage
    const totalSlippage = coinSlippage + avgExchangeSlippage + sizeImpact;
    
    return {
      coin,
      buyExchange,
      sellExchange,
      tradeSize,
      coinSlippage,
      exchangeSlippage: avgExchangeSlippage,
      sizeImpact,
      totalSlippage: Math.round(totalSlippage * 100) / 100,
      breakdown: {
        coin: `${(coinSlippage * 100).toFixed(2)}%`,
        exchange: `${(avgExchangeSlippage * 100).toFixed(2)}%`,
        size: `${(sizeImpact * 100).toFixed(2)}%`,
        total: `${(totalSlippage * 100).toFixed(2)}%`
      }
    };
  }

  /**
   * Get coin-based slippage
   * @param {string} coin - Coin symbol
   * @returns {number} Slippage percentage
   */
  getCoinSlippage(coin) {
    if (this.liquidityTiers.veryHigh.includes(coin)) return 0.02;  // 0.02%
    if (this.liquidityTiers.high.includes(coin)) return 0.05;      // 0.05%
    if (this.liquidityTiers.medium.includes(coin)) return 0.10;    // 0.10%
    return 0.20;  // 0.20% for low liquidity coins
  }

  /**
   * Get exchange-based slippage
   * @param {string} exchange - Exchange ID
   * @returns {number} Slippage percentage
   */
  getExchangeSlippage(exchange) {
    if (this.exchangeLiquidity.veryHigh.includes(exchange)) return 0.02;  // 0.02%
    if (this.exchangeLiquidity.high.includes(exchange)) return 0.05;      // 0.05%
    if (this.exchangeLiquidity.medium.includes(exchange)) return 0.08;    // 0.08%
    return 0.15;  // 0.15% for low liquidity exchanges
  }

  /**
   * Get trade size impact on slippage
   * @param {number} tradeSize - Trade size in USD
   * @param {string} coin - Coin symbol
   * @returns {number} Additional slippage from trade size
   */
  getTradeSizeImpact(tradeSize, coin) {
    // Very high liquidity coins can handle larger trades
    if (this.liquidityTiers.veryHigh.includes(coin)) {
      if (tradeSize > 5000) return 0.10;
      if (tradeSize > 2000) return 0.05;
      if (tradeSize > 1000) return 0.02;
      return 0.01;
    }
    
    // High liquidity coins
    if (this.liquidityTiers.high.includes(coin)) {
      if (tradeSize > 2000) return 0.15;
      if (tradeSize > 1000) return 0.08;
      if (tradeSize > 500) return 0.04;
      return 0.02;
    }
    
    // Medium/low liquidity coins
    if (tradeSize > 1000) return 0.25;
    if (tradeSize > 500) return 0.15;
    if (tradeSize > 300) return 0.08;
    return 0.03;
  }

  /**
   * Check if trade is viable after slippage
   * @param {Object} opportunity - Arbitrage opportunity
   * @param {number} tradeSize - Proposed trade size
   * @returns {Object} Viability check result
   */
  isTradeViable(opportunity, tradeSize) {
    this.stats.totalChecked++;
    
    const slippage = this.estimateSlippage(
      opportunity.coin,
      opportunity.buyExchange,
      opportunity.sellExchange,
      tradeSize
    );
    
    const netSpreadAfterSlippage = opportunity.netSpread - slippage.totalSlippage;
    const isViable = netSpreadAfterSlippage >= this.minNetSpreadAfterSlippage;
    
    // Update stats
    this.stats.totalSlippage += slippage.totalSlippage;
    this.stats.avgSlippage = this.stats.totalSlippage / this.stats.totalChecked;
    
    if (isViable) {
      this.stats.accepted++;
    } else {
      this.stats.rejected++;
    }
    
    return {
      viable: isViable,
      slippage: slippage.totalSlippage,
      netSpreadBefore: opportunity.netSpread,
      netSpreadAfter: netSpreadAfterSlippage,
      reason: isViable ? 'VIABLE' : 'SLIPPAGE_TOO_HIGH',
      details: slippage
    };
  }

  /**
   * Adjust trade size to reduce slippage
   * @param {Object} opportunity - Arbitrage opportunity
   * @param {number} requestedSize - Requested trade size
   * @returns {Object} Adjusted trade size recommendation
   */
  adjustTradeSize(opportunity, requestedSize) {
    const initialCheck = this.isTradeViable(opportunity, requestedSize);
    
    // If viable with requested size, return it
    if (initialCheck.viable) {
      return {
        originalSize: requestedSize,
        adjustedSize: requestedSize,
        reduction: 0,
        slippage: initialCheck.slippage,
        netSpreadAfter: initialCheck.netSpreadAfter,
        adjusted: false
      };
    }
    
    // Try reducing trade size
    let adjustedSize = requestedSize;
    let bestSize = null;
    let bestSpread = 0;
    
    // Try 80%, 60%, 40%, 20% of original size
    for (const factor of [0.8, 0.6, 0.4, 0.2]) {
      adjustedSize = requestedSize * factor;
      const check = this.isTradeViable(opportunity, adjustedSize);
      
      if (check.viable && check.netSpreadAfter > bestSpread) {
        bestSize = adjustedSize;
        bestSpread = check.netSpreadAfter;
      }
    }
    
    if (bestSize) {
      this.stats.tradeSizeReductions++;
      
      return {
        originalSize: requestedSize,
        adjustedSize: bestSize,
        reduction: ((requestedSize - bestSize) / requestedSize * 100).toFixed(1),
        slippage: this.estimateSlippage(
          opportunity.coin,
          opportunity.buyExchange,
          opportunity.sellExchange,
          bestSize
        ).totalSlippage,
        netSpreadAfter: bestSpread,
        adjusted: true
      };
    }
    
    // No viable size found
    return {
      originalSize: requestedSize,
      adjustedSize: 0,
      reduction: 100,
      slippage: initialCheck.slippage,
      netSpreadAfter: initialCheck.netSpreadAfter,
      adjusted: false,
      viable: false
    };
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const acceptanceRate = this.stats.totalChecked > 0 
      ? (this.stats.accepted / this.stats.totalChecked * 100).toFixed(1)
      : 0;
    
    const rejectionRate = this.stats.totalChecked > 0
      ? (this.stats.rejected / this.stats.totalChecked * 100).toFixed(1)
      : 0;
    
    return {
      totalChecked: this.stats.totalChecked,
      accepted: this.stats.accepted,
      rejected: this.stats.rejected,
      acceptanceRate: `${acceptanceRate}%`,
      rejectionRate: `${rejectionRate}%`,
      avgSlippage: `${(this.stats.avgSlippage * 100).toFixed(2)}%`,
      tradeSizeReductions: this.stats.tradeSizeReductions,
      maxSlippage: `${(this.maxSlippage * 100).toFixed(2)}%`,
      minNetSpread: `${(this.minNetSpreadAfterSlippage * 100).toFixed(2)}%`
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(70));
    console.log('🛡️  SLIPPAGE PROTECTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total checked: ${stats.totalChecked}`);
    console.log(`Accepted: ${stats.accepted} (${stats.acceptanceRate})`);
    console.log(`Rejected: ${stats.rejected} (${stats.rejectionRate})`);
    console.log(`Avg slippage: ${stats.avgSlippage}`);
    console.log(`Trade size reductions: ${stats.tradeSizeReductions}`);
    console.log(`Max acceptable slippage: ${stats.maxSlippage}`);
    console.log(`Min net spread after slippage: ${stats.minNetSpread}`);
    console.log('='.repeat(70) + '\n');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecked: 0,
      rejected: 0,
      accepted: 0,
      avgSlippage: 0,
      totalSlippage: 0,
      tradeSizeReductions: 0
    };
  }
}
