/**
 * Smart Coin Selection System
 * Dynamically selects coins based on performance and opportunity frequency
 */

export class SmartCoinSelector {
  constructor(options = {}) {
    this.maxCoins = options.maxCoins || 30;  // Max coins to track
    this.minOpportunities = options.minOpportunities || 2;  // Min opportunities in 24h
    this.evaluationPeriod = options.evaluationPeriod || 24 * 60 * 60 * 1000;  // 24 hours
    this.rotationInterval = options.rotationInterval || 60 * 60 * 1000;  // 1 hour
    
    // Always include top coins by market cap
    this.topByMarketCap = [
      'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'SOL', 'DOGE', 'DOT', 'MATIC', 'AVAX'
    ];
    
    // Coin performance tracking
    this.coinPerformance = new Map();
    
    // Current active coins
    this.activeCoins = [...this.topByMarketCap];
    
    // Stats
    this.stats = {
      totalCoinsTracked: 0,
      coinsAdded: 0,
      coinsRemoved: 0,
      lastRotation: null,
      rotations: 0
    };
  }

  /**
   * Track an opportunity for a coin
   * @param {string} coin - Coin symbol
   * @param {Object} opportunity - Opportunity details
   */
  trackOpportunity(coin, opportunity = {}) {
    if (!this.coinPerformance.has(coin)) {
      this.coinPerformance.set(coin, {
        opportunities: 0,
        totalSpread: 0,
        avgSpread: 0,
        bestSpread: 0,
        lastSeen: Date.now(),
        qualityScore: 0,
        firstSeen: Date.now()
      });
      this.stats.totalCoinsTracked++;
    }
    
    const perf = this.coinPerformance.get(coin);
    perf.opportunities++;
    perf.lastSeen = Date.now();
    
    if (opportunity.netSpread) {
      perf.totalSpread += opportunity.netSpread;
      perf.avgSpread = perf.totalSpread / perf.opportunities;
      perf.bestSpread = Math.max(perf.bestSpread, opportunity.netSpread);
    }
    
    if (opportunity.qualityScore) {
      perf.qualityScore = opportunity.qualityScore;
    }
  }

  /**
   * Get top performing coins
   * @param {number} limit - Number of coins to return
   * @returns {Array} Top performing coins
   */
  getTopPerformers(limit = 20) {
    const now = Date.now();
    const cutoffTime = now - this.evaluationPeriod;
    
    // Filter coins with recent activity
    const activePerformers = Array.from(this.coinPerformance.entries())
      .filter(([, perf]) => perf.lastSeen > cutoffTime)
      .filter(([, perf]) => perf.opportunities >= this.minOpportunities)
      .map(([coin, perf]) => ({
        coin,
        opportunities: perf.opportunities,
        avgSpread: perf.avgSpread,
        bestSpread: perf.bestSpread,
        score: this.calculatePerformanceScore(perf)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.coin);
    
    return activePerformers;
  }

  /**
   * Calculate performance score for a coin
   * @param {Object} perf - Performance data
   * @returns {number} Performance score
   */
  calculatePerformanceScore(perf) {
    // Score based on:
    // - Number of opportunities (40%)
    // - Average spread (30%)
    // - Best spread (20%)
    // - Recency (10%)
    
    const opportunityScore = Math.min(perf.opportunities / 10, 1) * 40;
    const avgSpreadScore = Math.min(perf.avgSpread / 2, 1) * 30;
    const bestSpreadScore = Math.min(perf.bestSpread / 3, 1) * 20;
    
    const hoursSinceLastSeen = (Date.now() - perf.lastSeen) / (60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - hoursSinceLastSeen / 24) * 10;
    
    return opportunityScore + avgSpreadScore + bestSpreadScore + recencyScore;
  }

  /**
   * Update active coin list
   * @param {Array} allCoins - All available coins
   * @returns {Array} Updated active coins
   */
  updateActiveCoins(allCoins = []) {
    this.stats.lastCandidates = Array.isArray(allCoins) ? allCoins.length : 0;
    const topPerformers = this.getTopPerformers(this.maxCoins - this.topByMarketCap.length);
    
    // Combine top market cap + top performers
    const newActiveCoins = [
      ...this.topByMarketCap,
      ...topPerformers.filter(coin => !this.topByMarketCap.includes(coin))
    ].slice(0, this.maxCoins);
    
    // Track changes
    const added = newActiveCoins.filter(coin => !this.activeCoins.includes(coin));
    const removed = this.activeCoins.filter(coin => !newActiveCoins.includes(coin));
    
    if (added.length > 0 || removed.length > 0) {
      console.log(`[smart-coins] Rotation: +${added.length} added, -${removed.length} removed`);
      
      if (added.length > 0) {
        console.log(`[smart-coins] Added: ${added.join(', ')}`);
        this.stats.coinsAdded += added.length;
      }
      
      if (removed.length > 0) {
        console.log(`[smart-coins] Removed: ${removed.join(', ')}`);
        this.stats.coinsRemoved += removed.length;
      }
      
      this.stats.lastRotation = new Date().toISOString();
      this.stats.rotations++;
    }
    
    this.activeCoins = newActiveCoins;
    return this.activeCoins;
  }

  /**
   * Get current active coins
   * @returns {Array} Active coins
   */
  getActiveCoins() {
    return this.activeCoins;
  }

  /**
   * Clean old performance data
   */
  cleanOldData() {
    const now = Date.now();
    const cutoffTime = now - (3 * this.evaluationPeriod); // Keep 3 days of data
    
    let cleaned = 0;
    for (const [coin, perf] of this.coinPerformance.entries()) {
      if (perf.lastSeen < cutoffTime) {
        this.coinPerformance.delete(coin);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[smart-coins] Cleaned ${cleaned} old coin records`);
    }
  }

  /**
   * Get coin performance details
   * @param {string} coin - Coin symbol
   * @returns {Object} Performance details
   */
  getCoinPerformance(coin) {
    return this.coinPerformance.get(coin) || null;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now();
    const cutoffTime = now - this.evaluationPeriod;

    const activeCoinsWithData = this.activeCoins
      .map(coin => {
        const perf = this.coinPerformance.get(coin);
        if (!perf || perf.lastSeen <= cutoffTime) {
          return null;
        }

        const score = this.calculatePerformanceScore(perf);
        return {
          coin,
          opportunities: perf.opportunities,
          avgSpread: perf.avgSpread.toFixed(2) + '%',
          score: score.toFixed(1)
        };
      })
      .filter(Boolean)
      .sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
      .slice(0, 10);
    
    return {
      activeCoins: this.activeCoins.length,
      totalTracked: this.coinPerformance.size,
      coinsAdded: this.stats.coinsAdded,
      coinsRemoved: this.stats.coinsRemoved,
      rotations: this.stats.rotations,
      lastRotation: this.stats.lastRotation,
      topPerformers: activeCoinsWithData
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(70));
    console.log('🎯 SMART COIN SELECTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Active coins: ${stats.activeCoins}/${this.maxCoins}`);
    console.log(`Total tracked: ${stats.totalTracked}`);
    console.log(`Rotations: ${stats.rotations}`);
    console.log(`Added: ${stats.coinsAdded} | Removed: ${stats.coinsRemoved}`);
    console.log(`Last rotation: ${stats.lastRotation || 'Never'}`);
    
    console.log('\nTop 10 Performers:');
    stats.topPerformers.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.coin}: ${item.opportunities} opp, ${item.avgSpread} avg, score ${item.score}`);
    });
    
    console.log('='.repeat(70) + '\n');
  }

  /**
   * Get coin list for display
   * @returns {string} Formatted coin list
   */
  getActiveCoinsList() {
    return this.activeCoins.join(', ');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCoinsTracked: this.coinPerformance.size,
      coinsAdded: 0,
      coinsRemoved: 0,
      lastRotation: null,
      rotations: 0
    };
  }
}
