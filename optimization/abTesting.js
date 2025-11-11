/**
 * A/B Testing Framework
 * Test different parameter configurations to find optimal settings
 */

export class ABTesting {
  constructor() {
    // Test variants
    this.variants = new Map();
    
    // Results tracking
    this.results = new Map();
    
    // Current active variant
    this.activeVariant = null;
    
    // Test configuration
    this.testConfig = {
      rotationInterval: 60 * 60 * 1000,  // 1 hour per variant
      minSampleSize: 10,  // Minimum trades per variant
      confidenceLevel: 0.95  // 95% confidence
    };
    
    // Test start time
    this.testStartTime = null;
    this.currentVariantStartTime = null;
  }

  /**
   * Add a test variant
   * @param {string} name - Variant name
   * @param {Object} params - Parameters to test
   */
  addVariant(name, params) {
    this.variants.set(name, {
      name,
      params,
      trades: 0,
      profit: 0,
      fees: 0,
      opportunities: 0,
      wins: 0,
      losses: 0
    });
    
    this.results.set(name, {
      name,
      params,
      trades: 0,
      profit: 0,
      fees: 0,
      netProfit: 0,
      avgProfit: 0,
      winRate: 0,
      opportunitiesPerTrade: 0
    });
    
    console.log(`[ab-test] Added variant: ${name}`, params);
  }

  /**
   * Start A/B test
   * @param {string} initialVariant - Initial variant to start with
   */
  startTest(initialVariant = null) {
    if (this.variants.size === 0) {
      console.error('[ab-test] No variants defined!');
      return;
    }
    
    this.testStartTime = Date.now();
    this.activeVariant = initialVariant || Array.from(this.variants.keys())[0];
    this.currentVariantStartTime = Date.now();
    
    console.log(`[ab-test] 🧪 Test started with variant: ${this.activeVariant}`);
    console.log(`[ab-test] Testing ${this.variants.size} variants`);
  }

  /**
   * Get current variant parameters
   * @returns {Object} Current variant parameters
   */
  getCurrentParams() {
    if (!this.activeVariant) return null;
    const variant = this.variants.get(this.activeVariant);
    return variant ? variant.params : null;
  }

  /**
   * Record an opportunity
   * @param {Object} opportunity - Opportunity details
   */
  recordOpportunity(opportunity) {
    if (!this.activeVariant) return;
    
    const variant = this.variants.get(this.activeVariant);
    if (variant) {
      variant.opportunities++;
      if (opportunity) {
        variant.lastOpportunity = opportunity;
      }
    }
  }

  /**
   * Record a trade
   * @param {Object} trade - Trade details
   */
  recordTrade(trade) {
    if (!this.activeVariant) return;
    
    const variant = this.variants.get(this.activeVariant);
    if (!variant) return;
    
    variant.trades++;
    variant.profit += trade.profit || 0;
    variant.fees += trade.fees || 0;
    
    if (trade.success) {
      variant.wins++;
    } else {
      variant.losses++;
    }
    
    console.log(`[ab-test] ${this.activeVariant}: Trade ${variant.trades}, Profit $${trade.profit?.toFixed(2)}`);
  }

  /**
   * Rotate to next variant
   */
  rotateVariant() {
    if (this.variants.size <= 1) return;
    
    const variantNames = Array.from(this.variants.keys());
    const currentIndex = variantNames.indexOf(this.activeVariant);
    const nextIndex = (currentIndex + 1) % variantNames.length;
    
    this.activeVariant = variantNames[nextIndex];
    this.currentVariantStartTime = Date.now();
    
    console.log(`[ab-test] 🔄 Rotated to variant: ${this.activeVariant}`);
    console.log(`[ab-test] Parameters:`, this.getCurrentParams());
  }

  /**
   * Calculate results for all variants
   */
  calculateResults() {
    for (const [name, variant] of this.variants.entries()) {
      const result = this.results.get(name);
      
      result.trades = variant.trades;
      result.profit = variant.profit;
      result.fees = variant.fees;
      result.netProfit = variant.profit - variant.fees;
      result.avgProfit = variant.trades > 0 ? variant.profit / variant.trades : 0;
      result.winRate = variant.trades > 0 ? variant.wins / variant.trades : 0;
      result.opportunitiesPerTrade = variant.trades > 0 ? variant.opportunities / variant.trades : 0;
    }
  }

  /**
   * Get best variant
   * @returns {Object} Best variant details
   */
  getBestVariant() {
    this.calculateResults();
    
    let best = null;
    let bestScore = -Infinity;
    
    for (const [name, result] of this.results.entries()) {
      // Score based on: net profit (70%) + win rate (20%) + avg profit (10%)
      const score = 
        (result.netProfit * 0.7) +
        (result.winRate * 100 * 0.2) +
        (result.avgProfit * 0.1);
      
      if (score > bestScore && result.trades >= this.testConfig.minSampleSize) {
        bestScore = score;
        best = {
          name,
          params: result.params,
          score: score.toFixed(2),
          ...result
        };
      }
    }
    
    return best;
  }

  /**
   * Get all results
   * @returns {Array} All variant results
   */
  getAllResults() {
    this.calculateResults();
    
    return Array.from(this.results.values())
      .map(result => ({
        name: result.name,
        params: result.params,
        trades: result.trades,
        profit: `$${result.profit.toFixed(2)}`,
        netProfit: `$${result.netProfit.toFixed(2)}`,
        avgProfit: `$${result.avgProfit.toFixed(2)}`,
        winRate: `${(result.winRate * 100).toFixed(1)}%`,
        opportunitiesPerTrade: result.opportunitiesPerTrade.toFixed(1)
      }))
      .sort((a, b) => parseFloat(b.netProfit.slice(1)) - parseFloat(a.netProfit.slice(1)));
  }

  /**
   * Get test summary
   * @returns {Object} Test summary
   */
  getSummary() {
    const runtime = this.testStartTime ? Date.now() - this.testStartTime : 0;
    const runtimeHours = runtime / (1000 * 60 * 60);
    
    const best = this.getBestVariant();
    const allResults = this.getAllResults();
    
    return {
      status: this.activeVariant ? 'running' : 'stopped',
      activeVariant: this.activeVariant,
      runtime: `${runtimeHours.toFixed(1)}h`,
      variantsCount: this.variants.size,
      bestVariant: best ? {
        name: best.name,
        netProfit: `$${best.netProfit.toFixed(2)}`,
        winRate: `${(best.winRate * 100).toFixed(1)}%`,
        trades: best.trades
      } : null,
      allResults
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 A/B TESTING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Status: ${summary.status}`);
    console.log(`Active variant: ${summary.activeVariant || 'None'}`);
    console.log(`Runtime: ${summary.runtime}`);
    console.log(`Variants: ${summary.variantsCount}`);
    
    if (summary.bestVariant) {
      console.log('\n🏆 Best Variant:');
      console.log(`  ${summary.bestVariant.name}`);
      console.log(`  Net profit: ${summary.bestVariant.netProfit}`);
      console.log(`  Win rate: ${summary.bestVariant.winRate}`);
      console.log(`  Trades: ${summary.bestVariant.trades}`);
    }
    
    console.log('\n📊 All Variants:');
    summary.allResults.forEach((result, i) => {
      const icon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      console.log(`  ${icon} ${result.name}: ${result.netProfit} (${result.trades} trades, ${result.winRate} win)`);
    });
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Stop test
   */
  stopTest() {
    console.log('[ab-test] 🛑 Test stopped');
    this.printSummary();
    this.activeVariant = null;
  }

  /**
   * Reset all data
   */
  reset() {
    this.variants.clear();
    this.results.clear();
    this.activeVariant = null;
    this.testStartTime = null;
    this.currentVariantStartTime = null;
  }
}
