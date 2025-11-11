/**
 * Opportunity Logger - Phase 1 of AI Balance Manager
 * 
 * Tracks and logs all arbitrage opportunities to build
 * historical data for AI predictions
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class OpportunityLogger {
  constructor() {
    const dbPath = path.join(__dirname, '..', 'storage', 'opportunities.db');
    this.db = new Database(dbPath);
    this.initDatabase();
    
    console.log('[opp-logger] 📊 Opportunity Logger initialized');
    console.log('[opp-logger] 🎯 Starting 7-day data collection for AI training');
  }

  /**
   * Initialize database schema
   */
  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        coin TEXT NOT NULL,
        buyExchange TEXT NOT NULL,
        sellExchange TEXT NOT NULL,
        buyPrice REAL NOT NULL,
        sellPrice REAL NOT NULL,
        grossSpread REAL NOT NULL,
        netSpread REAL NOT NULL,
        expectedProfit REAL,
        volume REAL,
        qualityScore INTEGER,
        executed BOOLEAN DEFAULT 0,
        executedAt INTEGER,
        actualProfit REAL
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON opportunities(timestamp);
      CREATE INDEX IF NOT EXISTS idx_exchanges ON opportunities(buyExchange, sellExchange);
      CREATE INDEX IF NOT EXISTS idx_coin ON opportunities(coin);
    `);
  }

  /**
   * Log new opportunity
   */
  logOpportunity(opportunity) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO opportunities (
          timestamp, coin, buyExchange, sellExchange,
          buyPrice, sellPrice, grossSpread, netSpread,
          expectedProfit, volume, qualityScore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        Date.now(),
        opportunity.coin,
        opportunity.buyM || opportunity.buyMarket,
        opportunity.sellM || opportunity.sellMarket,
        opportunity.buyP || opportunity.buyPrice || 0,
        opportunity.sellP || opportunity.sellPrice || 0,
        opportunity.grossSpread || 0,
        opportunity.netSpread || 0,
        opportunity.expectedProfit || 0,
        opportunity.volume || 0,
        opportunity.confidence || opportunity.qualityScore || 0
      );
    } catch (err) {
      console.error('[opp-logger] Error logging opportunity:', err.message);
    }
  }

  /**
   * Mark opportunity as executed
   */
  markExecuted(opportunityId, profit) {
    const stmt = this.db.prepare(`
      UPDATE opportunities 
      SET executed = 1, executedAt = ?, actualProfit = ?
      WHERE id = ?
    `);
    
    stmt.run(Date.now(), profit, opportunityId);
  }

  /**
   * Get top exchange pairs by opportunity count
   */
  getTopExchangePairs(days = 7, limit = 10) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      SELECT 
        buyExchange,
        sellExchange,
        COUNT(*) as opportunityCount,
        AVG(netSpread) as avgSpread,
        AVG(expectedProfit) as avgProfit,
        AVG(qualityScore) as avgQuality,
        SUM(executed) as executedCount
      FROM opportunities
      WHERE timestamp > ?
      GROUP BY buyExchange, sellExchange
      ORDER BY opportunityCount DESC
      LIMIT ?
    `);
    
    return stmt.all(since, limit);
  }

  /**
   * Get top coins by opportunity count
   */
  getTopCoins(days = 7, limit = 10) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      SELECT 
        coin,
        COUNT(*) as opportunityCount,
        AVG(netSpread) as avgSpread,
        AVG(expectedProfit) as avgProfit,
        SUM(executed) as executedCount
      FROM opportunities
      WHERE timestamp > ?
      GROUP BY coin
      ORDER BY opportunityCount DESC
      LIMIT ?
    `);
    
    return stmt.all(since, limit);
  }

  /**
   * Get hourly opportunity distribution (find best trading times)
   */
  getHourlyDistribution(days = 7) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      SELECT 
        CAST(strftime('%H', datetime(timestamp / 1000, 'unixepoch')) AS INTEGER) as hour,
        COUNT(*) as count,
        AVG(netSpread) as avgSpread
      FROM opportunities
      WHERE timestamp > ?
      GROUP BY hour
      ORDER BY hour
    `);
    
    return stmt.all(since);
  }

  /**
   * Get exchange pair frequency (how often pairs appear)
   */
  getExchangePairFrequency(buyExchange, sellExchange, days = 7) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalOpportunities,
        AVG(netSpread) as avgSpread,
        MAX(netSpread) as maxSpread,
        AVG(expectedProfit) as avgProfit
      FROM opportunities
      WHERE timestamp > ?
        AND buyExchange = ?
        AND sellExchange = ?
    `);
    
    return stmt.get(since, buyExchange, sellExchange);
  }

  /**
   * Get AI training data (last N days)
   */
  getAITrainingData(days = 7) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      SELECT * FROM opportunities
      WHERE timestamp > ?
      ORDER BY timestamp ASC
    `);
    
    return stmt.all(since);
  }

  /**
   * Generate analytics report
   */
  generateReport(days = 7) {
    const topPairs = this.getTopExchangePairs(days, 10);
    const topCoins = this.getTopCoins(days, 10);
    const hourlyDist = this.getHourlyDistribution(days);
    
    const totalOpps = this.db.prepare(`
      SELECT COUNT(*) as count FROM opportunities
      WHERE timestamp > ?
    `).get(Date.now() - (days * 24 * 60 * 60 * 1000));

    const report = {
      period: `Last ${days} days`,
      generatedAt: new Date().toISOString(),
      summary: {
        totalOpportunities: totalOpps.count,
        avgPerDay: Math.round(totalOpps.count / days),
        topPairs: topPairs.length,
        topCoins: topCoins.length
      },
      topExchangePairs: topPairs,
      topCoins: topCoins,
      hourlyDistribution: hourlyDist,
      recommendations: this.generateRecommendations(topPairs)
    };

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('   📊 OPPORTUNITY ANALYTICS REPORT');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`Period: ${report.period}`);
    console.log(`Total Opportunities: ${report.summary.totalOpportunities}`);
    console.log(`Average per Day: ${report.summary.avgPerDay}`);
    console.log('\n🔥 TOP EXCHANGE PAIRS:\n');
    
    topPairs.slice(0, 5).forEach((pair, i) => {
      console.log(`${i + 1}. ${pair.buyExchange} → ${pair.sellExchange}`);
      console.log(`   Opportunities: ${pair.opportunityCount}`);
      console.log(`   Avg Spread: ${pair.avgSpread.toFixed(2)}%`);
      console.log(`   Avg Profit: $${pair.avgProfit.toFixed(2)}`);
      console.log(`   Executed: ${pair.executedCount}/${pair.opportunityCount}`);
      console.log('');
    });

    console.log('💡 RECOMMENDATIONS:\n');
    report.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec.action}`);
      console.log(`   Expected Benefit: ${rec.benefit}`);
      console.log('');
    });

    return report;
  }

  /**
   * Generate recommendations based on data
   */
  generateRecommendations(topPairs) {
    const recommendations = [];

    topPairs.slice(0, 5).forEach(pair => {
      // If pair has many opportunities but low execution rate
      const executionRate = pair.executedCount / pair.opportunityCount;
      
      if (executionRate < 0.1 && pair.opportunityCount > 20) {
        recommendations.push({
          action: `Add balance to ${pair.buyExchange} and ${pair.sellExchange}`,
          reason: `${pair.opportunityCount} opportunities detected but only ${Math.round(executionRate * 100)}% executed`,
          benefit: `Potential +${Math.round(pair.avgProfit * pair.opportunityCount * 0.5)} USD/week`,
          priority: 'HIGH'
        });
      }
    });

    return recommendations;
  }

  /**
   * Clean old data (keep last 30 days)
   */
  cleanup() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      DELETE FROM opportunities WHERE timestamp < ?
    `);
    
    const result = stmt.run(thirtyDaysAgo);
    
    if (result.changes > 0) {
      console.log(`[opp-logger] 🧹 Cleaned up ${result.changes} old opportunities`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM opportunities').get();
    const executed = this.db.prepare('SELECT COUNT(*) as count FROM opportunities WHERE executed = 1').get();
    
    return {
      totalLogged: total.count,
      totalExecuted: executed.count,
      executionRate: total.count > 0 ? ((executed.count / total.count) * 100).toFixed(1) : 0
    };
  }
}

export default OpportunityLogger;
