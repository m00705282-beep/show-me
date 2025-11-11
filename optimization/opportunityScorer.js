/**
 * Opportunity Quality Scoring System
 * Scores and filters arbitrage opportunities based on multiple quality factors
 */

export class OpportunityScorer {
  constructor(options = {}) {
    this.minQualityScore = options.minQualityScore || 45; // Minimum score to consider (lowered for more opportunities)
    
    // Weight distribution (total = 100 points)
    this.weights = {
      spread: 40,        // Spread quality (40 points)
      exchange: 30,      // Exchange reliability (30 points)
      liquidity: 20,     // Coin liquidity (20 points)
      volatility: 10     // Price stability (10 points)
    };
    
    // Exchange tiers (reliability)
    this.exchangeTiers = {
      tier1: ['binance', 'kraken', 'coinbase', 'bitfinex'],
      tier2: ['kucoin', 'okx', 'bybit', 'gateio', 'huobi', 'ascendex', 'poloniex'],
      tier3: ['gemini', 'mexc', 'bitget', 'coinex', 'bitstamp', 'cryptocom']
    };
    
    // Coin liquidity tiers
    this.liquidityTiers = {
      high: ['BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL'],
      medium: ['DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI', 'LTC', 'BCH'],
      low: [] // Everything else
    };
    
    // Stats
    this.stats = {
      totalScored: 0,
      excellent: 0,  // 80-100
      good: 0,       // 60-79
      fair: 0,       // 40-59
      poor: 0,       // 0-39
      avgScore: 0,
      totalScore: 0
    };
  }

  /**
   * Score a single opportunity
   * @param {Object} opportunity - Arbitrage opportunity
   * @returns {Object} Scored opportunity with quality metrics
   */
  scoreOpportunity(opportunity) {
    let score = 0;
    const breakdown = {};
    
    // 1. Spread Quality (40 points max)
    const spreadScore = this.scoreSpread(opportunity.netSpread);
    score += spreadScore;
    breakdown.spread = spreadScore;
    
    // 2. Exchange Reliability (30 points max)
    const exchangeScore = this.scoreExchanges(opportunity.buyExchange, opportunity.sellExchange);
    score += exchangeScore;
    breakdown.exchange = exchangeScore;
    
    // 3. Coin Liquidity (20 points max)
    const liquidityScore = this.scoreLiquidity(opportunity.coin);
    score += liquidityScore;
    breakdown.liquidity = liquidityScore;
    
    // 4. Price Stability / Volatility (10 points max)
    const volatilityScore = this.scoreVolatility(opportunity.volatility || 5);
    score += volatilityScore;
    breakdown.volatility = volatilityScore;
    
    // Update stats
    this.updateStats(score);
    
    return {
      ...opportunity,
      qualityScore: Math.round(score),
      scoreBreakdown: breakdown,
      rating: this.getRating(score),
      recommended: score >= this.minQualityScore
    };
  }

  /**
   * Score spread quality
   * @param {number} netSpread - Net spread percentage
   * @returns {number} Score (0-40)
   */
  scoreSpread(netSpread) {
    if (netSpread >= 2.0) return 40;      // Excellent: 2%+
    if (netSpread >= 1.5) return 35;      // Very good: 1.5-2%
    if (netSpread >= 1.0) return 28;      // Good: 1-1.5%
    if (netSpread >= 0.7) return 20;      // Fair: 0.7-1%
    if (netSpread >= 0.5) return 12;      // Marginal: 0.5-0.7%
    return 5;                              // Poor: <0.5%
  }

  /**
   * Score exchange reliability
   * @param {string} buyExchange - Buy exchange ID
   * @param {string} sellExchange - Sell exchange ID
   * @returns {number} Score (0-30)
   */
  scoreExchanges(buyExchange, sellExchange) {
    const buyTier = this.getExchangeTier(buyExchange);
    const sellTier = this.getExchangeTier(sellExchange);
    
    // Both tier 1 = best
    if (buyTier === 1 && sellTier === 1) return 30;
    
    // One tier 1, one tier 2
    if ((buyTier === 1 && sellTier === 2) || (buyTier === 2 && sellTier === 1)) return 25;
    
    // Both tier 2
    if (buyTier === 2 && sellTier === 2) return 20;
    
    // One tier 1, one tier 3
    if ((buyTier === 1 && sellTier === 3) || (buyTier === 3 && sellTier === 1)) return 18;
    
    // One tier 2, one tier 3
    if ((buyTier === 2 && sellTier === 3) || (buyTier === 3 && sellTier === 2)) return 15;
    
    // Both tier 3
    if (buyTier === 3 && sellTier === 3) return 12;
    
    // Unknown exchanges
    return 8;
  }

  /**
   * Get exchange tier
   * @param {string} exchangeId - Exchange ID
   * @returns {number} Tier (1-3, or 4 for unknown)
   */
  getExchangeTier(exchangeId) {
    if (this.exchangeTiers.tier1.includes(exchangeId)) return 1;
    if (this.exchangeTiers.tier2.includes(exchangeId)) return 2;
    if (this.exchangeTiers.tier3.includes(exchangeId)) return 3;
    return 4; // Unknown
  }

  /**
   * Score coin liquidity
   * @param {string} coin - Coin symbol
   * @returns {number} Score (0-20)
   */
  scoreLiquidity(coin) {
    if (this.liquidityTiers.high.includes(coin)) return 20;      // High liquidity
    if (this.liquidityTiers.medium.includes(coin)) return 15;    // Medium liquidity
    return 10;                                                    // Low liquidity
  }

  /**
   * Score based on volatility (lower volatility = better)
   * @param {number} volatility - Estimated volatility percentage
   * @returns {number} Score (0-10)
   */
  scoreVolatility(volatility) {
    if (volatility < 2) return 10;       // Very stable
    if (volatility < 5) return 8;        // Stable
    if (volatility < 10) return 5;       // Moderate
    if (volatility < 20) return 3;       // Volatile
    return 1;                             // Very volatile
  }

  /**
   * Get rating label
   * @param {number} score - Quality score
   * @returns {string} Rating label
   */
  getRating(score) {
    if (score >= 85) return 'EXCELLENT';
    if (score >= 70) return 'VERY_GOOD';
    if (score >= 60) return 'GOOD';
    if (score >= 45) return 'FAIR';
    return 'POOR';
  }

  /**
   * Filter and sort opportunities by quality
   * @param {Array} opportunities - Array of opportunities
   * @param {number} minScore - Minimum quality score (optional)
   * @returns {Array} Filtered and sorted opportunities
   */
  filterByQuality(opportunities, minScore = null) {
    const threshold = minScore !== null ? minScore : this.minQualityScore;
    
    return opportunities
      .map(opp => this.scoreOpportunity(opp))
      .filter(opp => opp.qualityScore >= threshold)
      .sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * Get top N opportunities
   * @param {Array} opportunities - Array of opportunities
   * @param {number} limit - Number of top opportunities to return
   * @returns {Array} Top N opportunities
   */
  getTopOpportunities(opportunities, limit = 5) {
    return this.filterByQuality(opportunities)
      .slice(0, limit);
  }

  /**
   * Update statistics
   * @param {number} score - Quality score
   */
  updateStats(score) {
    this.stats.totalScored++;
    this.stats.totalScore += score;
    this.stats.avgScore = this.stats.totalScore / this.stats.totalScored;
    
    if (score >= 80) this.stats.excellent++;
    else if (score >= 60) this.stats.good++;
    else if (score >= 40) this.stats.fair++;
    else this.stats.poor++;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const total = this.stats.totalScored;
    
    return {
      totalScored: total,
      avgScore: this.stats.avgScore.toFixed(1),
      distribution: {
        excellent: `${this.stats.excellent} (${(this.stats.excellent / total * 100).toFixed(1)}%)`,
        good: `${this.stats.good} (${(this.stats.good / total * 100).toFixed(1)}%)`,
        fair: `${this.stats.fair} (${(this.stats.fair / total * 100).toFixed(1)}%)`,
        poor: `${this.stats.poor} (${(this.stats.poor / total * 100).toFixed(1)}%)`
      },
      minQualityScore: this.minQualityScore
    };
  }

  /**
   * Print summary
   * @param {Array} scoredOpportunities - Array of scored opportunities
   */
  printSummary(scoredOpportunities) {
    if (scoredOpportunities.length === 0) {
      console.log('[quality] No opportunities to display');
      return;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎯 OPPORTUNITY QUALITY SUMMARY');
    console.log('='.repeat(80));
    
    const top5 = scoredOpportunities.slice(0, 5);
    
    for (let i = 0; i < top5.length; i++) {
      const opp = top5[i];
      const icon = this.getRatingIcon(opp.rating);
      
      console.log(`\n${i + 1}. ${icon} ${opp.rating} (Score: ${opp.qualityScore}/100)`);
      console.log(`   ${opp.coin}: ${opp.netSpread.toFixed(2)}% spread`);
      console.log(`   ${opp.buyExchange} → ${opp.sellExchange}`);
      console.log(`   Breakdown: Spread=${opp.scoreBreakdown.spread}, Exchange=${opp.scoreBreakdown.exchange}, Liquidity=${opp.scoreBreakdown.liquidity}, Volatility=${opp.scoreBreakdown.volatility}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`Total opportunities: ${scoredOpportunities.length}`);
    console.log(`Avg quality score: ${this.stats.avgScore.toFixed(1)}/100`);
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Get rating icon
   * @param {string} rating - Rating label
   * @returns {string} Icon
   */
  getRatingIcon(rating) {
    switch (rating) {
      case 'EXCELLENT': return '🌟';
      case 'VERY_GOOD': return '⭐';
      case 'GOOD': return '✅';
      case 'FAIR': return '⚠️';
      default: return '❌';
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalScored: 0,
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      avgScore: 0,
      totalScore: 0
    };
  }
}
