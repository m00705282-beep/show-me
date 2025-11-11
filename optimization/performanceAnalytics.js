/**
 * Performance Analytics System
 * Comprehensive tracking and analysis of trading performance
 */

export class PerformanceAnalytics {
  constructor() {
    // Core metrics
    this.metrics = {
      totalOpportunities: 0,
      qualityOpportunities: 0,
      tradesExecuted: 0,
      tradesSuccessful: 0,
      totalProfit: 0,
      totalFees: 0,
      bestTrade: null,
      worstTrade: null,
      startTime: Date.now()
    };
    
    // Hourly stats (24 hours)
    this.hourlyStats = Array(24).fill(null).map(() => ({
      opportunities: 0,
      trades: 0,
      profit: 0,
      fees: 0,
      avgSpread: 0,
      totalSpread: 0
    }));
    
    // Coin performance
    this.coinStats = new Map();
    
    // Exchange performance
    this.exchangeStats = new Map();
    
    // Daily history
    this.dailyHistory = [];
    
    // Trade history (last 100)
    this.tradeHistory = [];
    this.maxTradeHistory = 100;
  }

  /**
   * Record an opportunity
   * @param {Object} opportunity - Opportunity details
   */
  recordOpportunity(opportunity) {
    this.metrics.totalOpportunities++;
    
    if (opportunity.qualityScore >= 60) {
      this.metrics.qualityOpportunities++;
    }
    
    // Hourly stats
    const hour = new Date().getHours();
    this.hourlyStats[hour].opportunities++;
    this.hourlyStats[hour].totalSpread += opportunity.netSpread;
    this.hourlyStats[hour].avgSpread = 
      this.hourlyStats[hour].totalSpread / this.hourlyStats[hour].opportunities;
    
    // Coin stats
    this.updateCoinStats(opportunity.coin, 'opportunity', opportunity);
    
    // Exchange stats
    this.updateExchangeStats(opportunity.buyExchange, 'opportunity');
    this.updateExchangeStats(opportunity.sellExchange, 'opportunity');
  }

  /**
   * Record a trade
   * @param {Object} trade - Trade details
   */
  recordTrade(trade) {
    this.metrics.tradesExecuted++;
    
    if (trade.success) {
      this.metrics.tradesSuccessful++;
    }
    
    this.metrics.totalProfit += trade.profit || 0;
    this.metrics.totalFees += trade.fees || 0;
    
    // Best/worst trade
    if (!this.metrics.bestTrade || (trade.profit || 0) > this.metrics.bestTrade.profit) {
      this.metrics.bestTrade = {
        coin: trade.coin,
        profit: trade.profit || 0,
        spread: trade.netSpread,
        timestamp: Date.now()
      };
    }
    
    if (!this.metrics.worstTrade || (trade.profit || 0) < this.metrics.worstTrade.profit) {
      this.metrics.worstTrade = {
        coin: trade.coin,
        profit: trade.profit || 0,
        spread: trade.netSpread,
        timestamp: Date.now()
      };
    }
    
    // Hourly stats
    const hour = new Date().getHours();
    this.hourlyStats[hour].trades++;
    this.hourlyStats[hour].profit += trade.profit || 0;
    this.hourlyStats[hour].fees += trade.fees || 0;
    
    // Coin stats
    this.updateCoinStats(trade.coin, 'trade', trade);
    
    // Exchange stats
    this.updateExchangeStats(trade.buyExchange, 'trade', trade);
    this.updateExchangeStats(trade.sellExchange, 'trade', trade);
    
    // Trade history
    this.tradeHistory.push({
      ...trade,
      timestamp: Date.now()
    });
    
    if (this.tradeHistory.length > this.maxTradeHistory) {
      this.tradeHistory.shift();
    }
  }

  /**
   * Update coin statistics
   * @param {string} coin - Coin symbol
   * @param {string} type - 'opportunity' or 'trade'
   * @param {Object} data - Data object
   */
  updateCoinStats(coin, type, data) {
    if (!this.coinStats.has(coin)) {
      this.coinStats.set(coin, {
        opportunities: 0,
        trades: 0,
        profit: 0,
        fees: 0,
        avgSpread: 0,
        totalSpread: 0,
        winRate: 0,
        wins: 0,
        losses: 0
      });
    }
    
    const stats = this.coinStats.get(coin);
    
    if (type === 'opportunity') {
      stats.opportunities++;
      stats.totalSpread += data.netSpread || 0;
      stats.avgSpread = stats.totalSpread / stats.opportunities;
    } else if (type === 'trade') {
      stats.trades++;
      stats.profit += data.profit || 0;
      stats.fees += data.fees || 0;
      
      if (data.success) {
        stats.wins++;
      } else {
        stats.losses++;
      }
      
      stats.winRate = stats.trades > 0 ? stats.wins / stats.trades : 0;
    }
  }

  /**
   * Update exchange statistics
   * @param {string} exchange - Exchange ID
   * @param {string} type - 'opportunity' or 'trade'
   * @param {Object} data - Data object
   */
  updateExchangeStats(exchange, type, data = {}) {
    if (!this.exchangeStats.has(exchange)) {
      this.exchangeStats.set(exchange, {
        opportunities: 0,
        trades: 0,
        profit: 0,
        fees: 0
      });
    }
    
    const stats = this.exchangeStats.get(exchange);
    
    if (type === 'opportunity') {
      stats.opportunities++;
    } else if (type === 'trade') {
      stats.trades++;
      stats.profit += (data.profit || 0) / 2; // Split between buy and sell
      stats.fees += (data.fees || 0) / 2;
    }
  }

  /**
   * Get summary statistics
   * @returns {Object} Summary stats
   */
  getSummary() {
    const runtime = Date.now() - this.metrics.startTime;
    const runtimeHours = runtime / (1000 * 60 * 60);
    
    const winRate = this.metrics.tradesExecuted > 0
      ? (this.metrics.tradesSuccessful / this.metrics.tradesExecuted * 100).toFixed(1)
      : 0;
    
    const avgProfit = this.metrics.tradesExecuted > 0
      ? (this.metrics.totalProfit / this.metrics.tradesExecuted).toFixed(2)
      : 0;
    
    const qualityRate = this.metrics.totalOpportunities > 0
      ? (this.metrics.qualityOpportunities / this.metrics.totalOpportunities * 100).toFixed(1)
      : 0;
    
    const netProfit = this.metrics.totalProfit - this.metrics.totalFees;
    
    return {
      runtime: {
        hours: runtimeHours.toFixed(1),
        start: new Date(this.metrics.startTime).toISOString()
      },
      opportunities: {
        total: this.metrics.totalOpportunities,
        quality: this.metrics.qualityOpportunities,
        qualityRate: `${qualityRate}%`,
        perHour: (this.metrics.totalOpportunities / runtimeHours).toFixed(1)
      },
      trades: {
        total: this.metrics.tradesExecuted,
        successful: this.metrics.tradesSuccessful,
        winRate: `${winRate}%`,
        perHour: (this.metrics.tradesExecuted / runtimeHours).toFixed(1)
      },
      profit: {
        total: `$${this.metrics.totalProfit.toFixed(2)}`,
        fees: `$${this.metrics.totalFees.toFixed(2)}`,
        net: `$${netProfit.toFixed(2)}`,
        avgPerTrade: `$${avgProfit}`,
        perHour: `$${(this.metrics.totalProfit / runtimeHours).toFixed(2)}`
      },
      best: {
        trade: this.metrics.bestTrade ? {
          coin: this.metrics.bestTrade.coin,
          profit: `$${this.metrics.bestTrade.profit.toFixed(2)}`,
          spread: `${this.metrics.bestTrade.spread.toFixed(2)}%`
        } : null
      },
      worst: {
        trade: this.metrics.worstTrade ? {
          coin: this.metrics.worstTrade.coin,
          profit: `$${this.metrics.worstTrade.profit.toFixed(2)}`,
          spread: `${this.metrics.worstTrade.spread.toFixed(2)}%`
        } : null
      }
    };
  }

  /**
   * Get hourly breakdown
   * @returns {Array} Hourly stats
   */
  getHourlyBreakdown() {
    return this.hourlyStats.map((stats, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      opportunities: stats.opportunities,
      trades: stats.trades,
      profit: `$${stats.profit.toFixed(2)}`,
      avgSpread: `${stats.avgSpread.toFixed(2)}%`
    }));
  }

  /**
   * Get top performing coins
   * @param {number} limit - Number of coins to return
   * @returns {Array} Top coins
   */
  getTopCoins(limit = 10) {
    return Array.from(this.coinStats.entries())
      .map(([coin, stats]) => ({
        coin,
        opportunities: stats.opportunities,
        trades: stats.trades,
        profit: `$${stats.profit.toFixed(2)}`,
        avgSpread: `${stats.avgSpread.toFixed(2)}%`,
        winRate: `${(stats.winRate * 100).toFixed(1)}%`
      }))
      .sort((a, b) => parseFloat(b.profit.slice(1)) - parseFloat(a.profit.slice(1)))
      .slice(0, limit);
  }

  /**
   * Get top performing exchanges
   * @param {number} limit - Number of exchanges to return
   * @returns {Array} Top exchanges
   */
  getTopExchanges(limit = 10) {
    return Array.from(this.exchangeStats.entries())
      .map(([exchange, stats]) => ({
        exchange,
        opportunities: stats.opportunities,
        trades: stats.trades,
        profit: `$${stats.profit.toFixed(2)}`
      }))
      .sort((a, b) => parseFloat(b.profit.slice(1)) - parseFloat(a.profit.slice(1)))
      .slice(0, limit);
  }

  /**
   * Get best hours for trading
   * @param {number} limit - Number of hours to return
   * @returns {Array} Best hours
   */
  getBestHours(limit = 5) {
    return this.hourlyStats
      .map((stats, hour) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        profit: stats.profit,
        trades: stats.trades,
        avgSpread: stats.avgSpread
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit)
      .map(h => ({
        ...h,
        profit: `$${h.profit.toFixed(2)}`,
        avgSpread: `${h.avgSpread.toFixed(2)}%`
      }));
  }

  /**
   * Get recent trades
   * @param {number} limit - Number of trades to return
   * @returns {Array} Recent trades
   */
  getRecentTrades(limit = 10) {
    return this.tradeHistory
      .slice(-limit)
      .reverse()
      .map(trade => ({
        coin: trade.coin,
        profit: `$${(trade.profit || 0).toFixed(2)}`,
        spread: `${(trade.netSpread || 0).toFixed(2)}%`,
        success: trade.success,
        timestamp: new Date(trade.timestamp).toISOString()
      }));
  }

  /**
   * Print detailed summary
   */
  printSummary() {
    const summary = this.getSummary();
    const topCoins = this.getTopCoins(5);
    const topExchanges = this.getTopExchanges(5);
    const bestHours = this.getBestHours(5);
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 PERFORMANCE ANALYTICS SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\n⏱️  Runtime:');
    console.log(`  ${summary.runtime.hours}h since ${summary.runtime.start}`);
    
    console.log('\n🎯 Opportunities:');
    console.log(`  Total: ${summary.opportunities.total} (${summary.opportunities.perHour}/hour)`);
    console.log(`  Quality: ${summary.opportunities.quality} (${summary.opportunities.qualityRate})`);
    
    console.log('\n💼 Trades:');
    console.log(`  Total: ${summary.trades.total} (${summary.trades.perHour}/hour)`);
    console.log(`  Win rate: ${summary.trades.winRate}`);
    
    console.log('\n💰 Profit:');
    console.log(`  Total: ${summary.profit.total}`);
    console.log(`  Fees: ${summary.profit.fees}`);
    console.log(`  Net: ${summary.profit.net}`);
    console.log(`  Avg/trade: ${summary.profit.avgPerTrade}`);
    console.log(`  Per hour: ${summary.profit.perHour}`);
    
    if (summary.best.trade) {
      console.log('\n🌟 Best Trade:');
      console.log(`  ${summary.best.trade.coin}: ${summary.best.trade.profit} (${summary.best.trade.spread} spread)`);
    }
    
    console.log('\n🏆 Top 5 Coins:');
    topCoins.forEach((coin, i) => {
      console.log(`  ${i + 1}. ${coin.coin}: ${coin.profit} (${coin.trades} trades, ${coin.winRate} win)`);
    });
    
    console.log('\n🏦 Top 5 Exchanges:');
    topExchanges.forEach((ex, i) => {
      console.log(`  ${i + 1}. ${ex.exchange}: ${ex.profit} (${ex.trades} trades)`);
    });
    
    console.log('\n⏰ Best 5 Hours:');
    bestHours.forEach((hour, i) => {
      console.log(`  ${i + 1}. ${hour.hour}: ${hour.profit} (${hour.trades} trades)`);
    });
    
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.metrics = {
      totalOpportunities: 0,
      qualityOpportunities: 0,
      tradesExecuted: 0,
      tradesSuccessful: 0,
      totalProfit: 0,
      totalFees: 0,
      bestTrade: null,
      worstTrade: null,
      startTime: Date.now()
    };
    
    this.hourlyStats = Array(24).fill(null).map(() => ({
      opportunities: 0,
      trades: 0,
      profit: 0,
      fees: 0,
      avgSpread: 0,
      totalSpread: 0
    }));
    
    this.coinStats.clear();
    this.exchangeStats.clear();
    this.tradeHistory = [];
  }
}
