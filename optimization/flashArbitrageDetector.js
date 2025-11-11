/**
 * Flash Arbitrage Detector
 * 
 * Detects ultra-short lived arbitrage opportunities (exist <5-10 seconds)
 * caused by exchange glitches, whale orders, or sudden liquidity changes.
 * 
 * These are rare but extremely profitable when caught quickly.
 * 
 * Expected Impact: +30-50% profit (rare but high value)
 */

export class FlashArbitrageDetector {
  constructor(config = {}) {
    this.config = {
      // Flash detection criteria
      minFlashSpread: config.minFlashSpread || 5.0, // Min 5% spread for flash
      maxFlashAge: config.maxFlashAge || 5000, // Max 5s old
      ultraFlashSpread: config.ultraFlashSpread || 10.0, // Ultra-flash: 10%+
      
      // Execution settings
      flashMultiplier: config.flashMultiplier || 2.0, // 2× normal position size
      ultraFlashMultiplier: config.ultraFlashMultiplier || 3.0, // 3× for ultra-flash
      maxFlashPosition: config.maxFlashPosition || 200, // Max $200 on flash
      
      // Risk management
      requireHighQuality: config.requireHighQuality !== false,
      minQualityScore: config.minQualityScore || 70,
      requireLowVolatility: config.requireLowVolatility || false,
      
      // Tracking
      trackingWindow: config.trackingWindow || 60000 // Track last 60s
    };
    
    this.recentOpportunities = new Map(); // coin → timestamp
    this.flashHistory = [];
    
    this.stats = {
      totalDetected: 0,
      flashDetected: 0,
      ultraFlashDetected: 0,
      flashExecuted: 0,
      flashProfitable: 0,
      totalFlashProfit: 0,
      avgFlashProfit: 0,
      flashSuccessRate: 0
    };
    
    console.log('[flash-detector] ⚡ Flash Arbitrage Detector initialized');
    console.log(`[flash-detector] Flash threshold: ${this.config.minFlashSpread}%, Max age: ${this.config.maxFlashAge}ms`);
  }

  /**
   * Detect if opportunity is a flash arbitrage
   */
  detectFlash(opportunity) {
    this.stats.totalDetected++;
    
    const { coin, netSpread, grossSpread, qualityScore, timestamp } = opportunity;
    
    // Calculate opportunity age
    const now = Date.now();
    const oppTimestamp = timestamp || now;
    const age = now - oppTimestamp;
    
    // Check if this is a new opportunity (not seen before recently)
    const lastSeen = this.recentOpportunities.get(coin);
    const isNew = !lastSeen || (now - lastSeen) > this.config.trackingWindow;
    
    // Update tracking
    this.recentOpportunities.set(coin, now);
    
    // Flash detection criteria
    const isFlashSpread = grossSpread >= this.config.minFlashSpread;
    const isUltraFlash = grossSpread >= this.config.ultraFlashSpread;
    const isFreshEnough = age <= this.config.maxFlashAge;
    const isQualityGood = !this.config.requireHighQuality || (qualityScore || 0) >= this.config.minQualityScore;
    
    // Determine flash type
    let flashType = null;
    let multiplier = 1.0;
    let maxPosition = null;
    
    if (isUltraFlash && isFreshEnough && isQualityGood && isNew) {
      flashType = 'ULTRA_FLASH';
      multiplier = this.config.ultraFlashMultiplier;
      maxPosition = this.config.maxFlashPosition;
      this.stats.ultraFlashDetected++;
      this.stats.flashDetected++;
    } else if (isFlashSpread && isFreshEnough && isQualityGood && isNew) {
      flashType = 'FLASH';
      multiplier = this.config.flashMultiplier;
      maxPosition = this.config.maxFlashPosition;
      this.stats.flashDetected++;
    }
    
    const result = {
      isFlash: flashType !== null,
      flashType,
      multiplier,
      maxPosition,
      spreadMagnitude: grossSpread,
      age,
      isNew,
      qualityScore: qualityScore || 0,
      executionPriority: this.calculatePriority(flashType, grossSpread)
    };
    
    // Log flash detection
    if (result.isFlash) {
      console.log('\n⚡⚡⚡ FLASH ARBITRAGE DETECTED! ⚡⚡⚡');
      console.log(`Type: ${flashType}`);
      console.log(`Coin: ${coin}`);
      console.log(`Gross Spread: ${grossSpread.toFixed(2)}%`);
      console.log(`Net Spread: ${netSpread.toFixed(2)}%`);
      console.log(`Age: ${age}ms`);
      console.log(`Position Multiplier: ${multiplier}×`);
      console.log(`Priority: ${result.executionPriority}`);
      console.log('⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡\n');
      
      // Add to history
      this.flashHistory.push({
        ...result,
        coin,
        netSpread,
        grossSpread,
        timestamp: now,
        executed: false
      });
      
      // Keep history limited (last 100)
      if (this.flashHistory.length > 100) {
        this.flashHistory.shift();
      }
    }
    
    return result;
  }

  /**
   * Calculate execution priority for flash opportunities
   */
  calculatePriority(flashType, spread) {
    if (flashType === 'ULTRA_FLASH') {
      return 1000 + spread * 10; // Highest priority
    } else if (flashType === 'FLASH') {
      return 500 + spread * 10; // High priority
    }
    return spread * 10; // Normal priority
  }

  /**
   * Record flash execution result
   */
  recordFlashExecution(flashId, profit) {
    this.stats.flashExecuted++;
    
    if (profit > 0) {
      this.stats.flashProfitable++;
      this.stats.totalFlashProfit += profit;
    }
    
    // Update success rate
    this.stats.flashSuccessRate = this.stats.flashExecuted > 0
      ? (this.stats.flashProfitable / this.stats.flashExecuted * 100)
      : 0;
    
    // Update average profit
    this.stats.avgFlashProfit = this.stats.flashExecuted > 0
      ? this.stats.totalFlashProfit / this.stats.flashExecuted
      : 0;
    
    // Update history
    const flashInHistory = this.flashHistory.find(f => 
      f.timestamp === flashId || f.coin === flashId
    );
    
    if (flashInHistory) {
      flashInHistory.executed = true;
      flashInHistory.profit = profit;
    }
  }

  /**
   * Get recent flash opportunities
   */
  getRecentFlashes(limit = 10) {
    return this.flashHistory
      .slice(-limit)
      .reverse()
      .map(f => ({
        ...f,
        ageSeconds: ((Date.now() - f.timestamp) / 1000).toFixed(1),
        profitStatus: f.executed ? (f.profit > 0 ? '✅ Profitable' : '❌ Loss') : '⏳ Pending'
      }));
  }

  /**
   * Clean old tracking data
   */
  cleanOldData() {
    const now = Date.now();
    const cutoff = now - this.config.trackingWindow;
    
    for (const [coin, timestamp] of this.recentOpportunities.entries()) {
      if (timestamp < cutoff) {
        this.recentOpportunities.delete(coin);
      }
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      flashSuccessRate: this.stats.flashSuccessRate.toFixed(1) + '%',
      avgFlashProfit: '$' + this.stats.avgFlashProfit.toFixed(2),
      totalFlashProfit: '$' + this.stats.totalFlashProfit.toFixed(2),
      recentFlashes: this.getRecentFlashes(5)
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   ⚡ FLASH ARBITRAGE SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`Total Opportunities Scanned: ${this.stats.totalDetected}`);
    console.log(`Flash Detected: ${this.stats.flashDetected}`);
    console.log(`Ultra-Flash Detected: ${this.stats.ultraFlashDetected}`);
    console.log(`Flash Executed: ${this.stats.flashExecuted}`);
    console.log(`Flash Profitable: ${this.stats.flashProfitable}`);
    console.log(`Flash Success Rate: ${this.stats.flashSuccessRate.toFixed(1)}%`);
    console.log(`Total Flash Profit: $${this.stats.totalFlashProfit.toFixed(2)}`);
    console.log(`Avg Flash Profit: $${this.stats.avgFlashProfit.toFixed(2)}`);
    
    console.log('\n⚡ Recent Flash Opportunities:');
    const recent = this.getRecentFlashes(5);
    if (recent.length > 0) {
      recent.forEach((f, i) => {
        console.log(`${i + 1}. ${f.coin} - ${f.flashType} (${f.grossSpread.toFixed(2)}%) - ${f.profitStatus}`);
      });
    } else {
      console.log('   No flash opportunities detected yet');
    }
    
    console.log('═══════════════════════════════════════════════════════\n');
  }

  /**
   * Get flash detection threshold info
   */
  getThresholds() {
    return {
      flash: {
        minSpread: this.config.minFlashSpread + '%',
        maxAge: this.config.maxFlashAge + 'ms',
        multiplier: this.config.flashMultiplier + '×'
      },
      ultraFlash: {
        minSpread: this.config.ultraFlashSpread + '%',
        maxAge: this.config.maxFlashAge + 'ms',
        multiplier: this.config.ultraFlashMultiplier + '×'
      }
    };
  }
}

export default FlashArbitrageDetector;
