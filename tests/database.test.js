/* global describe, it, before, after */
/**
 * Database Manager Tests
 */

import { expect } from 'chai';
import { DatabaseManager } from '../storage/database.js';
import { unlinkSync, existsSync } from 'fs';

describe('DatabaseManager', () => {
  let db;
  const testDbPath = './data/test-arbitrage.db';

  before(() => {
    // Create test database
    db = new DatabaseManager(testDbPath);
  });

  after(() => {
    // Clean up
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('Trades', () => {
    it('should insert a trade', () => {
      const trade = {
        timestamp: new Date().toISOString(),
        type: 'buy',
        exchange: 'binance',
        coin: 'BTC',
        amount: 0.01,
        price: 50000,
        fee: 5,
        feeBps: 10,
        totalCost: 505
      };

      const id = db.insertTrade(trade);
      expect(id).to.be.a('number');
      expect(id).to.be.greaterThan(0);
    });

    it('should retrieve trades', () => {
      const trades = db.getTrades({ limit: 10 });
      expect(trades).to.be.an('array');
      expect(trades.length).to.be.greaterThan(0);
    });

    it('should filter trades by coin', () => {
      const trades = db.getTrades({ coin: 'BTC', limit: 10 });
      expect(trades).to.be.an('array');
      trades.forEach(trade => {
        expect(trade.coin).to.equal('BTC');
      });
    });
  });

  describe('Opportunities', () => {
    it('should insert an opportunity', () => {
      const opp = {
        coin: 'ETH',
        buyExchange: 'kraken',
        buyPrice: 3000,
        sellExchange: 'coinbase',
        sellPrice: 3050,
        grossSpread: 1.67,
        netSpread: 1.47,
        totalFeePct: 0.2,
        qualityScore: 75,
        executed: false
      };

      const result = db.insertOpportunity(opp);
      expect(result).to.have.property('lastInsertRowid');
      expect(result.lastInsertRowid).to.be.greaterThan(0);
    });

    it('should retrieve opportunities', () => {
      const opps = db.getOpportunities(7, 10);
      expect(opps).to.be.an('array');
    });

    it('should get top opportunities', () => {
      const topOpps = db.getTopOpportunities(5);
      expect(topOpps).to.be.an('array');
    });
  });

  describe('Statistics', () => {
    it('should return database statistics', () => {
      const stats = db.getStats();
      expect(stats).to.be.an('object');
      expect(stats).to.have.property('total_trades');
      expect(stats).to.have.property('total_opportunities');
    });
  });
});
