/**
 * Exchange Health Monitoring System
 * Tracks exchange reliability, latency, and success rates
 */

export class ExchangeHealthMonitor {
  constructor(options = {}) {
    this.latencyThreshold = options.latencyThreshold || 5000;  // 5s max latency
    this.minSuccessRate = options.minSuccessRate || 0.7;  // 70% minimum success rate
    this.evaluationWindow = options.evaluationWindow || 100;  // Last 100 requests
    
    // Health data for each exchange
    this.health = new Map();
    
    // Stats
    this.stats = {
      totalExchanges: 0,
      healthyExchanges: 0,
      degradedExchanges: 0,
      unhealthyExchanges: 0
    };
  }

  /**
   * Record a fetch attempt
   * @param {string} exchangeId - Exchange ID
   * @param {boolean} success - Whether fetch succeeded
   * @param {number} latency - Fetch latency in ms
   * @param {string} error - Error message if failed
   */
  recordFetch(exchangeId, success, latency, error = null) {
    if (!this.health.has(exchangeId)) {
      this.health.set(exchangeId, {
        requests: [],
        successCount: 0,
        failCount: 0,
        totalLatency: 0,
        avgLatency: 0,
        lastSuccess: null,
        lastFail: null,
        lastError: null,
        status: 'unknown',
        statusHistory: []
      });
      this.stats.totalExchanges++;
    }
    
    const health = this.health.get(exchangeId);
    
    // Add request to history
    health.requests.push({
      success,
      latency,
      timestamp: Date.now(),
      error
    });
    
    // Keep only last N requests
    if (health.requests.length > this.evaluationWindow) {
      const removed = health.requests.shift();
      if (removed.success) {
        health.successCount--;
        health.totalLatency -= removed.latency;
      } else {
        health.failCount--;
      }
    }
    
    // Update counts
    if (success) {
      health.successCount++;
      health.totalLatency += latency;
      health.lastSuccess = Date.now();
    } else {
      health.failCount++;
      health.lastFail = Date.now();
      health.lastError = error;
    }
    
    // Calculate metrics
    const totalRequests = health.successCount + health.failCount;
    const successRate = totalRequests > 0 ? health.successCount / totalRequests : 0;
    health.avgLatency = health.successCount > 0 ? health.totalLatency / health.successCount : 0;
    
    // Determine status
    const previousStatus = health.status;
    health.status = this.determineStatus(successRate, health.avgLatency);
    
    // Track status changes
    if (previousStatus !== health.status && previousStatus !== 'unknown') {
      health.statusHistory.push({
        from: previousStatus,
        to: health.status,
        timestamp: Date.now()
      });

      console.log(`[health] ${exchangeId}: ${previousStatus} → ${health.status} (${(successRate * 100).toFixed(0)}% success, ${health.avgLatency.toFixed(0)}ms avg)`);
    }
    health.lastSeenExchange = exchangeId;
    if (!success && error) {
      health.lastErrorExchange = exchangeId;
    }

    // Update stats
    this.updateStats();
  }

  /**
   * Determine exchange status
   * @param {number} successRate - Success rate (0-1)
   * @param {number} avgLatency - Average latency in ms
   * @returns {string} Status (healthy, degraded, unhealthy)
   */
  determineStatus(successRate, avgLatency) {
    // Unhealthy: <50% success or >10s latency
    if (successRate < 0.5 || avgLatency > 10000) {
      return 'unhealthy';
    }
    
    // Degraded: <70% success or >5s latency
    if (successRate < this.minSuccessRate || avgLatency > this.latencyThreshold) {
      return 'degraded';
    }
    
    // Healthy: ≥70% success and ≤5s latency
    return 'healthy';
  }

  /**
   * Update statistics
   */
  updateStats() {
    this.stats.healthyExchanges = 0;
    this.stats.degradedExchanges = 0;
    this.stats.unhealthyExchanges = 0;
    this.stats.lastStatusUpdate = null;
    
    for (const health of this.health.values()) {
      if (health.status === 'healthy') this.stats.healthyExchanges++;
      else if (health.status === 'degraded') this.stats.degradedExchanges++;
      else if (health.status === 'unhealthy') this.stats.unhealthyExchanges++;
      this.stats.lastStatusUpdate = health.lastSuccess || health.lastFail || Date.now();
    }
  }

  /**
   * Check if exchange should be used
   * @param {string} exchangeId - Exchange ID
   * @returns {boolean} Whether exchange is usable
   */
  shouldUseExchange(exchangeId) {
    const health = this.health.get(exchangeId);
    if (!health) return true;  // No data yet, assume healthy
    
    // Don't use unhealthy exchanges
    return health.status !== 'unhealthy';
  }

  /**
   * Get healthy exchanges
   * @returns {Array} List of healthy exchange IDs
   */
  getHealthyExchanges() {
    return Array.from(this.health.entries())
      .filter(([, health]) => health.status === 'healthy')
      .map(([id]) => id);
  }

  /**
   * Get exchange health
   * @param {string} exchangeId - Exchange ID
   * @returns {Object} Health data
   */
  getExchangeHealth(exchangeId) {
    const health = this.health.get(exchangeId);
    if (!health) return null;
    
    const totalRequests = health.successCount + health.failCount;
    const successRate = totalRequests > 0 ? health.successCount / totalRequests : 0;
    
    return {
      exchangeId,
      status: health.status,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      avgLatency: `${health.avgLatency.toFixed(0)}ms`,
      totalRequests,
      successCount: health.successCount,
      failCount: health.failCount,
      lastSuccess: health.lastSuccess ? new Date(health.lastSuccess).toISOString() : null,
      lastFail: health.lastFail ? new Date(health.lastFail).toISOString() : null,
      lastError: health.lastError
    };
  }

  /**
   * Get all exchange health data
   * @returns {Array} Health data for all exchanges
   */
  getAllHealth() {
    return Array.from(this.health.keys())
      .map(id => this.getExchangeHealth(id))
      .sort((a, b) => {
        // Sort by status (healthy first)
        const statusOrder = { healthy: 0, degraded: 1, unhealthy: 2, unknown: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      });
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const healthyPercent = this.stats.totalExchanges > 0
      ? (this.stats.healthyExchanges / this.stats.totalExchanges * 100).toFixed(1)
      : 0;
    
    const degradedPercent = this.stats.totalExchanges > 0
      ? (this.stats.degradedExchanges / this.stats.totalExchanges * 100).toFixed(1)
      : 0;
    
    const unhealthyPercent = this.stats.totalExchanges > 0
      ? (this.stats.unhealthyExchanges / this.stats.totalExchanges * 100).toFixed(1)
      : 0;
    
    return {
      totalExchanges: this.stats.totalExchanges,
      healthy: `${this.stats.healthyExchanges} (${healthyPercent}%)`,
      degraded: `${this.stats.degradedExchanges} (${degradedPercent}%)`,
      unhealthy: `${this.stats.unhealthyExchanges} (${unhealthyPercent}%)`,
      latencyThreshold: `${this.latencyThreshold}ms`,
      minSuccessRate: `${(this.minSuccessRate * 100).toFixed(0)}%`
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    const stats = this.getStats();
    const allHealth = this.getAllHealth();
    
    console.log('\n' + '='.repeat(80));
    console.log('🏥 EXCHANGE HEALTH MONITORING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total exchanges: ${stats.totalExchanges}`);
    console.log(`Healthy: ${stats.healthy}`);
    console.log(`Degraded: ${stats.degraded}`);
    console.log(`Unhealthy: ${stats.unhealthy}`);
    console.log(`Thresholds: ${stats.minSuccessRate} success rate, ${stats.latencyThreshold} latency`);
    
    // Show top 10 exchanges
    console.log('\nTop Exchanges:');
    allHealth.slice(0, 10).forEach((health, i) => {
      const icon = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
      console.log(`  ${i + 1}. ${icon} ${health.exchangeId}: ${health.status} (${health.successRate} success, ${health.avgLatency} avg)`);
    });
    
    // Show unhealthy exchanges
    const unhealthy = allHealth.filter(h => h.status === 'unhealthy');
    if (unhealthy.length > 0) {
      console.log('\n⚠️  Unhealthy Exchanges:');
      unhealthy.forEach(health => {
        console.log(`  ❌ ${health.exchangeId}: ${health.successRate} success, ${health.avgLatency} avg`);
        if (health.lastError) {
          console.log(`     Last error: ${health.lastError}`);
        }
      });
    }
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.health.clear();
    this.stats = {
      totalExchanges: 0,
      healthyExchanges: 0,
      degradedExchanges: 0,
      unhealthyExchanges: 0
    };
  }
}
