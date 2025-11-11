/**
 * SQLite Database Module
 * Replaces JSON file storage with proper database
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

export class DatabaseManager {
  constructor(dbPath = './data/arbitrage.db') {
    this.dbPath = dbPath;
    
    // Ensure data directory exists
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Initialize database
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance
    
    // Create tables
    this.createTables();
    
    console.log('[db] ✅ Database initialized:', this.dbPath);
  }

  /**
   * Create all necessary tables
   */
  createTables() {
    // Trades table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
        exchange TEXT NOT NULL,
        coin TEXT NOT NULL,
        amount REAL NOT NULL,
        price REAL NOT NULL,
        fee REAL NOT NULL,
        fee_bps INTEGER NOT NULL,
        total_cost REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Balance snapshots table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS balance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount REAL NOT NULL,
        usd_value REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Performance metrics table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        starting_balance REAL NOT NULL,
        ending_balance REAL NOT NULL,
        profit_loss REAL NOT NULL,
        profit_percent REAL NOT NULL,
        total_trades INTEGER NOT NULL,
        win_rate REAL NOT NULL,
        total_fees REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Opportunities table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        coin TEXT NOT NULL,
        buy_exchange TEXT NOT NULL,
        buy_price REAL NOT NULL,
        sell_exchange TEXT NOT NULL,
        sell_price REAL NOT NULL,
        gross_spread REAL NOT NULL,
        net_spread REAL NOT NULL,
        total_fee_pct REAL NOT NULL,
        quality_score INTEGER,
        executed BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Exchange health table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS exchange_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        exchange TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('healthy', 'degraded', 'unhealthy')),
        success_rate REAL NOT NULL,
        avg_latency REAL NOT NULL,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alerts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
        sent_email BOOLEAN DEFAULT 0,
        sent_telegram BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
      CREATE INDEX IF NOT EXISTS idx_trades_coin ON trades(coin);
      CREATE INDEX IF NOT EXISTS idx_opportunities_timestamp ON opportunities(timestamp);
      CREATE INDEX IF NOT EXISTS idx_opportunities_coin ON opportunities(coin);
      CREATE INDEX IF NOT EXISTS idx_exchange_health_exchange ON exchange_health(exchange);
      CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
    `);

    console.log('[db] ✅ Tables created/verified');
  }

  /**
   * Insert trade
   */
  insertTrade(trade) {
    const stmt = this.db.prepare(`
      INSERT INTO trades (timestamp, type, exchange, coin, amount, price, fee, fee_bps, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      trade.timestamp,
      trade.type,
      trade.exchange,
      trade.coin,
      trade.amount,
      trade.price,
      trade.fee,
      trade.feeBps,
      trade.totalCost
    );
    
    return result.lastInsertRowid;
  }

  /**
   * Get trades (with optional filters)
   */
  getTrades(filters = {}) {
    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = [];
    
    if (filters.coin) {
      query += ' AND coin = ?';
      params.push(filters.coin);
    }
    
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters.startDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }
    
    if (filters.endDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Insert balance snapshot
   */
  insertBalanceSnapshot(currency, amount, usdValue = null) {
    const stmt = this.db.prepare(`
      INSERT INTO balance_snapshots (timestamp, currency, amount, usd_value)
      VALUES (datetime('now'), ?, ?, ?)
    `);
    
    return stmt.run(currency, amount, usdValue);
  }

  /**
   * Get latest balance
   */
  getLatestBalance() {
    const stmt = this.db.prepare(`
      SELECT currency, amount, usd_value
      FROM balance_snapshots
      WHERE timestamp = (SELECT MAX(timestamp) FROM balance_snapshots)
    `);
    
    return stmt.all();
  }

  /**
   * Insert opportunity
   */
  insertOpportunity(opp) {
    const stmt = this.db.prepare(`
      INSERT INTO opportunities (timestamp, coin, buy_exchange, buy_price, sell_exchange, sell_price, 
                                 gross_spread, net_spread, total_fee_pct, quality_score, executed)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      opp.coin,
      opp.buyExchange || opp.buyM,
      opp.buyPrice || opp.buyP,
      opp.sellExchange || opp.sellM,
      opp.sellPrice || opp.sellP,
      opp.grossSpread,
      opp.netSpread,
      opp.totalFeePct || 0,
      opp.qualityScore || null,
      opp.executed ? 1 : 0
    );
  }

  /**
   * Get opportunities (last N days)
   */
  getOpportunities(days = 7, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM opportunities
      WHERE timestamp >= datetime('now', '-' || ? || ' days')
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    return stmt.all(days, limit);
  }

  /**
   * Get top opportunities by net spread
   */
  getTopOpportunities(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT coin, 
             AVG(net_spread) as avg_spread,
             COUNT(*) as count,
             MAX(net_spread) as max_spread,
             MIN(timestamp) as first_seen,
             MAX(timestamp) as last_seen
      FROM opportunities
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY coin
      ORDER BY avg_spread DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  /**
   * Insert exchange health record
   */
  insertExchangeHealth(exchange, status, successRate, avgLatency, lastError = null) {
    const stmt = this.db.prepare(`
      INSERT INTO exchange_health (timestamp, exchange, status, success_rate, avg_latency, last_error)
      VALUES (datetime('now'), ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(exchange, status, successRate, avgLatency, lastError);
  }

  /**
   * Get exchange health stats
   */
  getExchangeHealth(exchange = null, hours = 24) {
    let query = `
      SELECT exchange,
             status,
             AVG(success_rate) as avg_success_rate,
             AVG(avg_latency) as avg_latency,
             MAX(timestamp) as last_check
      FROM exchange_health
      WHERE timestamp >= datetime('now', '-' || ? || ' hours')
    `;
    
    const params = [hours];
    
    if (exchange) {
      query += ' AND exchange = ?';
      params.push(exchange);
    }
    
    query += ' GROUP BY exchange ORDER BY avg_success_rate DESC';
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Insert alert
   */
  insertAlert(alertType, subject, message, severity = 'medium', sentEmail = false, sentTelegram = false) {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (timestamp, alert_type, subject, message, severity, sent_email, sent_telegram)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(alertType, subject, message, severity, sentEmail ? 1 : 0, sentTelegram ? 1 : 0);
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    return stmt.all(limit);
  }

  /**
   * Get statistics summary
   */
  getStats() {
    const stmt = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM trades) as total_trades,
        (SELECT COUNT(*) FROM opportunities) as total_opportunities,
        (SELECT COUNT(*) FROM alerts) as total_alerts,
        (SELECT COUNT(DISTINCT exchange) FROM exchange_health) as exchanges_tracked,
        (SELECT COUNT(DISTINCT coin) FROM trades) as coins_traded
    `);
    
    return stmt.get();
  }

  /**
   * Save daily performance
   */
  saveDailyPerformance(date, stats) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO performance_metrics 
      (date, starting_balance, ending_balance, profit_loss, profit_percent, total_trades, win_rate, total_fees)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      date,
      stats.startingBalance,
      stats.endingBalance,
      stats.profitLoss,
      stats.profitPercent,
      stats.totalTrades,
      stats.winRate,
      stats.totalFees
    );
  }

  /**
   * Get performance history
   */
  getPerformanceHistory(days = 30) {
    const stmt = this.db.prepare(`
      SELECT * FROM performance_metrics
      WHERE date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `);
    
    return stmt.all(days);
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    console.log('[db] Database closed');
  }

  /**
   * Backup database
   */
  backup(backupPath) {
    return this.db.backup(backupPath);
  }

  /**
   * Vacuum database (optimize)
   */
  vacuum() {
    this.db.exec('VACUUM');
    console.log('[db] Database vacuumed (optimized)');
  }
}
