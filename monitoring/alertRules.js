/**
 * Advanced Alert Rules Engine
 * Configurable thresholds and custom alert rules
 */

export class AlertRulesEngine {
  constructor(config = {}) {
    // Default rules
    this.rules = {
      // Balance rules
      balance: {
        enabled: config.balance?.enabled ?? true,
        dropPercent: config.balance?.dropPercent || 10,
        gainPercent: config.balance?.gainPercent || 20,
        minBalance: config.balance?.minBalance || 100,
        checkInterval: config.balance?.checkInterval || 300000 // 5 min
      },
      
      // Opportunity rules
      opportunity: {
        enabled: config.opportunity?.enabled ?? true,
        minSpread: config.opportunity?.minSpread || 2.0,
        minQualityScore: config.opportunity?.minQualityScore || 70,
        consecutiveCount: config.opportunity?.consecutiveCount || 3,
        timeWindow: config.opportunity?.timeWindow || 300000 // 5 min
      },
      
      // Exchange health rules
      exchange: {
        enabled: config.exchange?.enabled ?? true,
        downMinutes: config.exchange?.downMinutes || 15,
        degradedMinutes: config.exchange?.degradedMinutes || 30,
        minSuccessRate: config.exchange?.minSuccessRate || 0.8,
        maxLatency: config.exchange?.maxLatency || 5000
      },
      
      // Trading rules
      trading: {
        enabled: config.trading?.enabled ?? true,
        consecutiveLosses: config.trading?.consecutiveLosses || 5,
        dailyLossPercent: config.trading?.dailyLossPercent || 5,
        hourlyTradeLimit: config.trading?.hourlyTradeLimit || 10,
        startingBalance: config.trading?.startingBalance || config.balance?.startingBalance || 10000
      },
      
      // Performance rules
      performance: {
        enabled: config.performance?.enabled ?? true,
        minROI: config.performance?.minROI || -5, // Alert if ROI < -5%
        maxDrawdown: config.performance?.maxDrawdown || 15,
        minWinRate: config.performance?.minWinRate || 40
      },
      
      // System rules
      system: {
        enabled: config.system?.enabled ?? true,
        maxMemoryMB: config.system?.maxMemoryMB || 512,
        maxCpuPercent: config.system?.maxCpuPercent || 80,
        maxErrorRate: config.system?.maxErrorRate || 0.1
      }
    };
    
    // Rule evaluation cache
    this.evaluationCache = new Map();
    this.consecutiveHits = new Map();
    this.tradingStartingBalance = this.rules.trading.startingBalance || 10000;
    
    console.log('[alert-rules] Alert Rules Engine initialized');
    this.logRules();
  }

  /**
   * Log current rules
   */
  logRules() {
    console.log('[alert-rules] Active Rules:');
    Object.entries(this.rules).forEach(([category, rules]) => {
      if (rules.enabled) {
        console.log(`[alert-rules]   ✅ ${category}:`, JSON.stringify(rules, null, 0));
      } else {
        console.log(`[alert-rules]   ❌ ${category}: disabled`);
      }
    });
  }

  /**
   * Evaluate balance rules
   */
  evaluateBalance(currentBalance, previousBalance) {
    if (!this.rules.balance.enabled) return null;
    
    if (typeof previousBalance !== 'number' || previousBalance <= 0) {
      return null;
    }
    
    const dropPercent = ((previousBalance - currentBalance) / previousBalance) * 100;
    const gainPercent = ((currentBalance - previousBalance) / previousBalance) * 100;
    
    // Check balance drop
    if (dropPercent >= this.rules.balance.dropPercent) {
      return {
        type: 'balance_drop',
        severity: dropPercent >= 20 ? 'critical' : 'high',
        message: `Balance dropped by ${dropPercent.toFixed(2)}%`,
        data: { currentBalance, previousBalance, dropPercent }
      };
    }
    
    // Check large gain (might be suspicious)
    if (gainPercent >= this.rules.balance.gainPercent) {
      return {
        type: 'balance_gain',
        severity: 'medium',
        message: `Balance increased by ${gainPercent.toFixed(2)}%`,
        data: { currentBalance, previousBalance, gainPercent }
      };
    }
    
    // Check minimum balance
    if (currentBalance < this.rules.balance.minBalance) {
      return {
        type: 'balance_low',
        severity: 'high',
        message: `Balance below minimum threshold: $${currentBalance.toFixed(2)}`,
        data: { currentBalance, minBalance: this.rules.balance.minBalance }
      };
    }
    
    return null;
  }

  /**
   * Evaluate opportunity rules
   */
  evaluateOpportunity(opportunity) {
    if (!this.rules.opportunity.enabled) return null;
    
    const alerts = [];
    
    // Check spread threshold
    if (opportunity.netSpread >= this.rules.opportunity.minSpread) {
      const key = `opp_${opportunity.coin}`;
      const count = (this.consecutiveHits.get(key) || 0) + 1;
      this.consecutiveHits.set(key, count);
      
      // Alert only if consecutive opportunities
      if (count >= this.rules.opportunity.consecutiveCount) {
        alerts.push({
          type: 'high_profit_opportunity',
          severity: opportunity.netSpread >= 5 ? 'critical' : 'high',
          message: `High-profit opportunity for ${opportunity.coin}: ${opportunity.netSpread.toFixed(2)}%`,
          data: opportunity
        });
        
        this.consecutiveHits.set(key, 0); // Reset after alert
      }
    }
    
    // Check quality score
    if (opportunity.qualityScore && opportunity.qualityScore >= this.rules.opportunity.minQualityScore) {
      alerts.push({
        type: 'quality_opportunity',
        severity: 'medium',
        message: `Quality opportunity detected: ${opportunity.coin} (Score: ${opportunity.qualityScore})`,
        data: opportunity
      });
    }
    
    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Evaluate exchange health rules
   */
  evaluateExchangeHealth(exchange, status) {
    if (!this.rules.exchange.enabled) return null;
    
    const alerts = [];
    
    // Check if exchange is down
    if (status.status === 'unhealthy') {
      const downMinutes = Math.floor((Date.now() - status.lastSuccess) / 60000);
      
      if (downMinutes >= this.rules.exchange.downMinutes) {
        alerts.push({
          type: 'exchange_down',
          severity: 'critical',
          message: `Exchange ${exchange} is down for ${downMinutes} minutes`,
          data: { exchange, downMinutes, status }
        });
      }
    }
    
    // Check if exchange is degraded
    if (status.status === 'degraded') {
      alerts.push({
        type: 'exchange_degraded',
        severity: 'medium',
        message: `Exchange ${exchange} performance degraded (Success: ${(status.successRate * 100).toFixed(1)}%)`,
        data: { exchange, status }
      });
    }
    
    // Check success rate
    if (status.successRate < this.rules.exchange.minSuccessRate) {
      alerts.push({
        type: 'exchange_low_success',
        severity: 'high',
        message: `Exchange ${exchange} has low success rate: ${(status.successRate * 100).toFixed(1)}%`,
        data: { exchange, successRate: status.successRate }
      });
    }
    
    // Check latency
    if (status.avgLatency > this.rules.exchange.maxLatency) {
      alerts.push({
        type: 'exchange_high_latency',
        severity: 'medium',
        message: `Exchange ${exchange} has high latency: ${status.avgLatency.toFixed(0)}ms`,
        data: { exchange, latency: status.avgLatency }
      });
    }
    
    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Evaluate trading performance rules
   */
  evaluateTrading(trades) {
    if (!this.rules.trading.enabled) return null;
    
    const alerts = [];
    const recentTrades = trades.slice(-20); // Last 20 trades
    
    // Check consecutive losses
    let consecutiveLosses = 0;
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      if (recentTrades[i].profit < 0) {
        consecutiveLosses++;
      } else {
        break;
      }
    }
    
    if (consecutiveLosses >= this.rules.trading.consecutiveLosses) {
      alerts.push({
        type: 'consecutive_losses',
        severity: 'high',
        message: `${consecutiveLosses} consecutive losing trades detected`,
        data: { consecutiveLosses, recentTrades: recentTrades.slice(-5) }
      });
    }
    
    // Check daily loss
    const today = new Date().toDateString();
    const todayTrades = trades.filter(t => new Date(t.timestamp).toDateString() === today);
    const todayProfit = todayTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const startBalance = this.tradingStartingBalance || 10000;
    const dailyLossPercent = startBalance > 0 ? (todayProfit / startBalance) * 100 : 0;
    
    if (dailyLossPercent <= -this.rules.trading.dailyLossPercent) {
      alerts.push({
        type: 'daily_loss_limit',
        severity: 'critical',
        message: `Daily loss limit reached: ${dailyLossPercent.toFixed(2)}%`,
        data: { dailyLoss: todayProfit, dailyLossPercent, todayTrades: todayTrades.length }
      });
    }
    
    // Check hourly trade limit
    const oneHourAgo = Date.now() - 3600000;
    const recentHourTrades = trades.filter(t => new Date(t.timestamp).getTime() > oneHourAgo);
    
    if (recentHourTrades.length >= this.rules.trading.hourlyTradeLimit) {
      alerts.push({
        type: 'trade_frequency_high',
        severity: 'medium',
        message: `High trading frequency: ${recentHourTrades.length} trades in last hour`,
        data: { hourlyTrades: recentHourTrades.length }
      });
    }
    
    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Evaluate performance rules
   */
  evaluatePerformance(performance) {
    if (!this.rules.performance.enabled) return null;
    
    const alerts = [];
    
    // Check ROI
    if (performance.profitPercent < this.rules.performance.minROI) {
      alerts.push({
        type: 'low_roi',
        severity: 'high',
        message: `ROI below threshold: ${performance.profitPercent.toFixed(2)}%`,
        data: { roi: performance.profitPercent, threshold: this.rules.performance.minROI }
      });
    }
    
    // Check win rate
    if (performance.winRate < this.rules.performance.minWinRate) {
      alerts.push({
        type: 'low_win_rate',
        severity: 'medium',
        message: `Win rate below threshold: ${performance.winRate.toFixed(1)}%`,
        data: { winRate: performance.winRate, threshold: this.rules.performance.minWinRate }
      });
    }
    
    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Evaluate system health rules
   */
  evaluateSystem(systemStats) {
    if (!this.rules.system.enabled) return null;
    
    const alerts = [];
    
    // Check memory usage
    if (systemStats.memoryMB > this.rules.system.maxMemoryMB) {
      alerts.push({
        type: 'high_memory',
        severity: 'medium',
        message: `Memory usage high: ${systemStats.memoryMB.toFixed(0)}MB`,
        data: { memoryMB: systemStats.memoryMB, threshold: this.rules.system.maxMemoryMB }
      });
    }
    
    // Check CPU usage
    if (systemStats.cpuPercent > this.rules.system.maxCpuPercent) {
      alerts.push({
        type: 'high_cpu',
        severity: 'medium',
        message: `CPU usage high: ${systemStats.cpuPercent.toFixed(1)}%`,
        data: { cpuPercent: systemStats.cpuPercent, threshold: this.rules.system.maxCpuPercent }
      });
    }
    
    // Check error rate
    if (systemStats.errorRate > this.rules.system.maxErrorRate) {
      alerts.push({
        type: 'high_error_rate',
        severity: 'high',
        message: `Error rate high: ${(systemStats.errorRate * 100).toFixed(1)}%`,
        data: { errorRate: systemStats.errorRate, threshold: this.rules.system.maxErrorRate }
      });
    }
    
    return alerts.length > 0 ? alerts : null;
  }

  /**
   * Update rule thresholds dynamically
   */
  updateRule(category, key, value) {
    if (this.rules[category]) {
      this.rules[category][key] = value;
      console.log(`[alert-rules] Updated ${category}.${key} = ${value}`);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable rule category
   */
  toggleCategory(category, enabled) {
    if (this.rules[category]) {
      this.rules[category].enabled = enabled;
      console.log(`[alert-rules] ${category} rules ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Get current rules configuration
   */
  getRules() {
    return this.rules;
  }

  /**
   * Export rules to JSON (for saving to config)
   */
  exportRules() {
    return JSON.stringify(this.rules, null, 2);
  }
}
