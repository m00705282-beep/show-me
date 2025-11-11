/**
 * Adaptive Polling System
 * Dynamically adjusts polling interval based on market activity
 */

export class AdaptivePoller {
  constructor(options = {}) {
    this.minInterval = options.minInterval || 15000;  // 15s minimum (when very active)
    this.maxInterval = options.maxInterval || 45000;  // 45s maximum (when quiet)
    this.defaultInterval = options.defaultInterval || 30000;  // 30s default
    this.currentInterval = this.defaultInterval;
    
    // History tracking
    this.opportunityHistory = [];
    this.historySize = 10; // Keep last 10 cycles
    
    // Thresholds
    this.highActivityThreshold = 15;  // >15 opportunities = high activity
    this.lowActivityThreshold = 5;    // <5 opportunities = low activity
    
    // Adjustment step
    this.adjustmentStep = 5000; // Adjust by 5s each time
    
    // Stats
    this.stats = {
      totalCycles: 0,
      fastCycles: 0,
      normalCycles: 0,
      slowCycles: 0,
      avgOpportunities: 0
    };
  }

  /**
   * Adjust polling interval based on opportunities found
   * @param {number} opportunitiesFound - Number of opportunities in last cycle
   * @returns {number} Next polling interval in ms
   */
  adjustInterval(opportunitiesFound) {
    // Add to history
    this.opportunityHistory.push(opportunitiesFound);
    
    // Keep only last N cycles
    if (this.opportunityHistory.length > this.historySize) {
      this.opportunityHistory.shift();
    }
    
    // Calculate average opportunities
    const avgOpportunities = this.opportunityHistory.reduce((a, b) => a + b, 0) / this.opportunityHistory.length;
    
    // Store previous interval for logging
    const previousInterval = this.currentInterval;
    
    // Adjust interval based on activity
    if (avgOpportunities > this.highActivityThreshold) {
      // High activity → poll faster
      this.currentInterval = Math.max(this.minInterval, this.currentInterval - this.adjustmentStep);
      
      if (this.currentInterval !== previousInterval) {
        console.log(`[adaptive] 🚀 High activity (${avgOpportunities.toFixed(1)} avg opp) → polling every ${this.currentInterval/1000}s`);
      }
    } else if (avgOpportunities < this.lowActivityThreshold) {
      // Low activity → poll slower
      this.currentInterval = Math.min(this.maxInterval, this.currentInterval + this.adjustmentStep);
      
      if (this.currentInterval !== previousInterval) {
        console.log(`[adaptive] 🐌 Low activity (${avgOpportunities.toFixed(1)} avg opp) → polling every ${this.currentInterval/1000}s`);
      }
    } else {
      // Medium activity → gradually return to default
      if (this.currentInterval < this.defaultInterval) {
        this.currentInterval = Math.min(this.defaultInterval, this.currentInterval + this.adjustmentStep);
      } else if (this.currentInterval > this.defaultInterval) {
        this.currentInterval = Math.max(this.defaultInterval, this.currentInterval - this.adjustmentStep);
      }
      
      if (this.currentInterval !== previousInterval) {
        console.log(`[adaptive] ⚖️  Medium activity (${avgOpportunities.toFixed(1)} avg opp) → polling every ${this.currentInterval/1000}s`);
      }
    }
    
    // Update stats
    this.updateStats(avgOpportunities);
    
    return this.currentInterval;
  }

  /**
   * Update statistics
   * @param {number} avgOpportunities - Average opportunities
   */
  updateStats(avgOpportunities) {
    this.stats.totalCycles++;
    this.stats.avgOpportunities = avgOpportunities;
    
    if (this.currentInterval === this.minInterval) {
      this.stats.fastCycles++;
    } else if (this.currentInterval === this.maxInterval) {
      this.stats.slowCycles++;
    } else {
      this.stats.normalCycles++;
    }
  }

  /**
   * Get current interval
   * @returns {number} Current interval in ms
   */
  getCurrentInterval() {
    return this.currentInterval;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const fastPercent = (this.stats.fastCycles / this.stats.totalCycles * 100).toFixed(1);
    const normalPercent = (this.stats.normalCycles / this.stats.totalCycles * 100).toFixed(1);
    const slowPercent = (this.stats.slowCycles / this.stats.totalCycles * 100).toFixed(1);
    
    return {
      currentInterval: `${this.currentInterval/1000}s`,
      avgOpportunities: this.stats.avgOpportunities.toFixed(1),
      totalCycles: this.stats.totalCycles,
      distribution: {
        fast: `${this.stats.fastCycles} (${fastPercent}%)`,
        normal: `${this.stats.normalCycles} (${normalPercent}%)`,
        slow: `${this.stats.slowCycles} (${slowPercent}%)`
      },
      history: this.opportunityHistory
    };
  }

  /**
   * Reset to default interval
   */
  reset() {
    this.currentInterval = this.defaultInterval;
    this.opportunityHistory = [];
    console.log('[adaptive] Reset to default interval:', this.defaultInterval/1000 + 's');
  }

  /**
   * Print summary
   */
  printSummary() {
    const stats = this.getStats();
    console.log('\n' + '='.repeat(50));
    console.log('📊 ADAPTIVE POLLING SUMMARY');
    console.log('='.repeat(50));
    console.log(`Current interval: ${stats.currentInterval}`);
    console.log(`Avg opportunities: ${stats.avgOpportunities}`);
    console.log(`Total cycles: ${stats.totalCycles}`);
    console.log(`Fast cycles (${this.minInterval/1000}s): ${stats.distribution.fast}`);
    console.log(`Normal cycles (${this.defaultInterval/1000}s): ${stats.distribution.normal}`);
    console.log(`Slow cycles (${this.maxInterval/1000}s): ${stats.distribution.slow}`);
    console.log(`Recent history: [${stats.history.join(', ')}]`);
    console.log('='.repeat(50) + '\n');
  }
}
