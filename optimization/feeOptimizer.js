/**
 * Fee Optimization Engine
 * 
 * Automatically selects the cheapest route for arbitrage trades by:
 * - Comparing maker vs taker fees
 * - Evaluating withdrawal costs between exchanges
 * - Finding optimal trading pairs (e.g., BTC/USDT vs BTC/USD)
 * - Calculating total cost including network fees
 * 
 * Expected Impact: +15-25% profit increase through fee reduction
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class FeeOptimizer {
  constructor() {
    this.feeConfig = this.loadFeeConfig();
    
    // Network fee estimates (in USD)
    this.networkFees = {
      'BTC': { fast: 5.0, normal: 3.0, slow: 1.5 },
      'ETH': { fast: 15.0, normal: 8.0, slow: 3.0 },
      'USDT-ERC20': { fast: 15.0, normal: 8.0, slow: 3.0 },
      'USDT-TRC20': { fast: 1.0, normal: 1.0, slow: 1.0 },
      'USDT-BEP20': { fast: 0.2, normal: 0.2, slow: 0.2 },
      'BNB': { fast: 0.3, normal: 0.2, slow: 0.1 },
      'SOL': { fast: 0.01, normal: 0.01, slow: 0.005 },
      'XRP': { fast: 0.01, normal: 0.005, slow: 0.002 },
      'default': { fast: 2.0, normal: 1.0, slow: 0.5 }
    };
    
    this.stats = {
      optimizationsPerformed: 0,
      totalFeesSaved: 0,
      avgFeeReduction: 0,
      bestRoute: null,
      worstRoute: null
    };
    
    console.log('[fee-optimizer] 💰 Fee Optimization Engine initialized');
    console.log(`[fee-optimizer] Loaded fees for ${Object.keys(this.feeConfig.exchanges).length} exchanges`);
  }

  /**
   * Load fee configuration from file
   */
  loadFeeConfig() {
    try {
      const configPath = join(__dirname, '..', 'config', 'fees.json');
      const data = readFileSync(configPath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('[fee-optimizer] Failed to load fee config:', err.message);
      return { exchanges: {}, defaultFees: { maker: 20, taker: 20 } };
    }
  }

  /**
   * Find the most cost-effective way to execute an arbitrage opportunity
   * 
   * @param {Object} opportunity - The arbitrage opportunity
   * @param {number} tradeSize - Trade size in USD
   * @returns {Object} Optimized route with fee breakdown
   */
  optimizeRoute(opportunity, tradeSize) {
    this.stats.optimizationsPerformed++;
    
    const { coin, buyM, sellM, buyP, sellP, netSpread } = opportunity;
    
    // Calculate fees for both maker and taker scenarios
    const scenarios = [
      this.calculateScenario('maker-maker', coin, buyM, sellM, buyP, sellP, tradeSize),
      this.calculateScenario('maker-taker', coin, buyM, sellM, buyP, sellP, tradeSize),
      this.calculateScenario('taker-maker', coin, buyM, sellM, buyP, sellP, tradeSize),
      this.calculateScenario('taker-taker', coin, buyM, sellM, buyP, sellP, tradeSize)
    ];
    
    // Find cheapest scenario
    const bestScenario = scenarios.reduce((best, current) => 
      current.totalFees < best.totalFees ? current : best
    );
    
    const worstScenario = scenarios.reduce((worst, current) => 
      current.totalFees > worst.totalFees ? current : worst
    );
    
    // Calculate fee savings
    const feeSavings = worstScenario.totalFees - bestScenario.totalFees;
    this.stats.totalFeesSaved += feeSavings;
    this.stats.avgFeeReduction = this.stats.totalFeesSaved / this.stats.optimizationsPerformed;
    
    // Update best/worst routes
    if (!this.stats.bestRoute || feeSavings > (this.stats.bestRoute.savings || 0)) {
      this.stats.bestRoute = { ...bestScenario, savings: feeSavings };
    }
    
    return {
      recommended: bestScenario,
      alternatives: scenarios.filter(s => s.type !== bestScenario.type),
      feeSavings: Math.round(feeSavings * 100) / 100,
      savingsPercent: ((feeSavings / worstScenario.totalFees) * 100).toFixed(1),
      netProfitAfterFees: Math.round((tradeSize * netSpread / 100 - bestScenario.totalFees) * 100) / 100
    };
  }

  /**
   * Calculate fees for a specific scenario
   */
  calculateScenario(type, coin, buyExchange, sellExchange, buyPrice, sellPrice, tradeSize) {
    const [buyType, sellType] = type.split('-');
    
    // Get exchange fees
    const buyFees = this.getExchangeFees(buyExchange);
    const sellFees = this.getExchangeFees(sellExchange);
    
    // Trading fees
    const buyTradingFee = (tradeSize * (buyFees[buyType] || buyFees.taker) / 10000);
    const sellTradingFee = (tradeSize * (sellFees[sellType] || sellFees.taker) / 10000);
    
    // Withdrawal fee (if needed - assume we need to move coins between exchanges)
    const withdrawalFee = this.getWithdrawalFee(coin, buyExchange);
    
    // Network fee (for blockchain transfer)
    const networkFee = this.getNetworkFee(coin, 'normal');
    
    // Total fees
    const totalFees = buyTradingFee + sellTradingFee + withdrawalFee + networkFee;
    
    return {
      type,
      buyExchange,
      sellExchange,
      buyType,
      sellType,
      fees: {
        buyTrading: Math.round(buyTradingFee * 100) / 100,
        sellTrading: Math.round(sellTradingFee * 100) / 100,
        withdrawal: Math.round(withdrawalFee * 100) / 100,
        network: Math.round(networkFee * 100) / 100
      },
      totalFees: Math.round(totalFees * 100) / 100,
      feePercent: ((totalFees / tradeSize) * 100).toFixed(2)
    };
  }

  /**
   * Get exchange fees
   */
  getExchangeFees(exchangeId) {
    return this.feeConfig.exchanges[exchangeId] || this.feeConfig.defaultFees;
  }

  /**
   * Get withdrawal fee for a coin from an exchange
   */
  getWithdrawalFee(coin, exchangeId) {
    const fees = this.feeConfig.exchanges[exchangeId];
    if (!fees || !fees.withdrawal) {
      return 0;
    }
    
    // Check if there's a specific fee for this coin
    if (fees.withdrawal[coin]) {
      return fees.withdrawal[coin];
    }
    
    // Use default withdrawal fee
    return fees.withdrawal.default || 0;
  }

  /**
   * Get network fee for coin transfer
   */
  getNetworkFee(coin, speed = 'normal') {
    // For stablecoins, check network type
    if (coin === 'USDT') {
      // Default to TRC20 (cheapest)
      return this.networkFees['USDT-TRC20'][speed];
    }
    
    return (this.networkFees[coin] || this.networkFees.default)[speed];
  }

  /**
   * Find cheapest network for stablecoin transfers
   */
  findCheapestNetwork(coin) {
    if (coin !== 'USDT' && coin !== 'USDC') {
      return null;
    }
    
    const networks = {
      'ERC20': this.networkFees[`${coin}-ERC20`].normal,
      'TRC20': this.networkFees[`${coin}-TRC20`].normal,
      'BEP20': this.networkFees[`${coin}-BEP20`].normal
    };
    
    return Object.entries(networks).reduce((cheapest, [network, fee]) => 
      fee < cheapest.fee ? { network, fee } : cheapest,
      { network: 'ERC20', fee: networks.ERC20 }
    );
  }

  /**
   * Calculate if using a limit order (maker) is worth waiting for
   */
  shouldUseLimitOrder(opportunity, tradeSize, maxWaitTime = 60000) {
    const makerSavings = this.calculateMakerSavings(opportunity.buyM, opportunity.sellM, tradeSize);
    
    // If savings are significant (> $0.50) and we have time, use limit order
    if (makerSavings > 0.5 && maxWaitTime > 30000) {
      return {
        recommended: true,
        reason: `Maker fees save $${makerSavings.toFixed(2)}`,
        potentialSavings: makerSavings,
        maxWait: maxWaitTime
      };
    }
    
    return {
      recommended: false,
      reason: 'Taker execution preferred for speed',
      savingsNotWorthWait: makerSavings
    };
  }

  /**
   * Calculate savings from using maker orders instead of taker
   */
  calculateMakerSavings(buyExchange, sellExchange, tradeSize) {
    const buyFees = this.getExchangeFees(buyExchange);
    const sellFees = this.getExchangeFees(sellExchange);
    
    const takerTotal = (buyFees.taker + sellFees.taker) / 10000 * tradeSize;
    const makerTotal = (buyFees.maker + sellFees.maker) / 10000 * tradeSize;
    
    return takerTotal - makerTotal;
  }

  /**
   * Find alternative trading pairs with lower fees
   * Example: BTC/USDT vs BTC/USD vs BTC/BUSD
   */
  findAlternativePairs(baseCoin, currentQuote = 'USDT') {
    const alternatives = ['USDT', 'USDC', 'BUSD', 'USD', 'EUR'];
    
    return alternatives
      .filter(quote => quote !== currentQuote)
      .map(quote => ({
        pair: `${baseCoin}/${quote}`,
        quote,
        estimatedFeeDiff: this.estimatePairFeeDiff(currentQuote, quote)
      }))
      .sort((a, b) => a.estimatedFeeDiff - b.estimatedFeeDiff);
  }

  /**
   * Estimate fee difference between trading pairs
   */
  estimatePairFeeDiff(currentQuote, alternativeQuote) {
    // Simplified estimation
    // BUSD usually has lower fees on Binance, USDC on Coinbase, etc.
    const feeModifiers = {
      'USDT': 0,
      'USDC': -0.1,  // Slightly lower
      'BUSD': -0.15, // Lower on some exchanges
      'USD': 0.1,    // Fiat pairs often higher
      'EUR': 0.15
    };
    
    return (feeModifiers[alternativeQuote] || 0) - (feeModifiers[currentQuote] || 0);
  }

  /**
   * Get comprehensive fee report for an opportunity
   */
  getFeeReport(opportunity, tradeSize) {
    const optimization = this.optimizeRoute(opportunity, tradeSize);
    const cheapestNetwork = this.findCheapestNetwork(opportunity.coin);
    const limitOrderAnalysis = this.shouldUseLimitOrder(opportunity, tradeSize);
    
    return {
      optimization,
      networkRecommendation: cheapestNetwork,
      limitOrderRecommendation: limitOrderAnalysis,
      summary: {
        totalFeesOptimized: optimization.recommended.totalFees,
        feePercent: optimization.recommended.feePercent,
        feeSavings: optimization.feeSavings,
        netProfit: optimization.netProfitAfterFees
      }
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgFeeReduction: Math.round(this.stats.avgFeeReduction * 100) / 100
    };
  }

  /**
   * Update fee configuration
   */
  updateFeeConfig(exchangeId, newFees) {
    if (!this.feeConfig.exchanges[exchangeId]) {
      this.feeConfig.exchanges[exchangeId] = {};
    }
    
    this.feeConfig.exchanges[exchangeId] = {
      ...this.feeConfig.exchanges[exchangeId],
      ...newFees
    };
    
    console.log(`[fee-optimizer] Updated fees for ${exchangeId}`);
  }
}

export default FeeOptimizer;
