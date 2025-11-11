/* global describe, it, beforeEach, afterEach */
/**
 * Paper Trading Engine Tests
 */

import { expect } from 'chai';
import { PaperTradingEngine } from '../trading/paperTrading.js';
import { unlinkSync, existsSync } from 'fs';

describe('PaperTradingEngine', () => {
  let engine;
  const testFile = './data/test-paper-trading.json';

  beforeEach(() => {
    // Clean up test file if exists
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
    engine = new PaperTradingEngine('./config/fees.json', testFile, {
      persistentStateOptions: {
        autoSave: false,
        handleSignals: false
      }
    });
    engine.balance.USD = 10000;
  });

  afterEach(() => {
    if (engine) {
      engine.dispose();
    }
    // Clean up
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  describe('Trading Operations', () => {
    it('should execute buy order', async () => {
      const initialBalance = engine.balance.USD;
      const result = await engine.buy('binance', 'BTC', 0.01, 50000);
      
      expect(result.success).to.be.true;
      expect(engine.balance.USD).to.be.lessThan(initialBalance);
      expect(engine.balance.BTC).to.equal(0.01);
      expect(engine.trades.length).to.equal(1);
    });

    it('should execute sell order', async () => {
      // Buy first
      await engine.buy('binance', 'BTC', 0.01, 50000);
      const balanceAfterBuy = engine.balance.USD;
      
      // Then sell
      const result = await engine.sell('coinbase', 'BTC', 0.01, 51000);
      
      expect(result.success).to.be.true;
      expect(engine.balance.USD).to.be.greaterThan(balanceAfterBuy);
      expect(engine.balance.BTC).to.equal(0);
      expect(engine.trades.length).to.equal(2);
    });

    it('should apply trading fees', async () => {
      const initialBalance = engine.balance.USD;
      const price = 50000;
      const amount = 0.01;
      const cost = price * amount; // $500
      
      await engine.buy('binance', 'BTC', amount, price);
      
      const actualCost = initialBalance - engine.balance.USD;
      expect(actualCost).to.be.greaterThan(cost); // Should include fees
    });

    it('should reject buy when insufficient balance', async () => {
      const result = await engine.buy('binance', 'BTC', 100, 50000); // $5M trade
      expect(result.success).to.be.false;
      expect(result.reason).to.equal('insufficient_funds');
    });

    it('should reject sell when insufficient coin balance', async () => {
      const result = await engine.sell('binance', 'BTC', 10, 50000); // Don't have BTC
      expect(result.success).to.be.false;
      expect(result.reason).to.equal('insufficient_balance');
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate performance correctly', async () => {
      // Execute profitable trade
      await engine.buy('binance', 'BTC', 0.01, 50000);
      await engine.sell('coinbase', 'BTC', 0.01, 51000);
      
      const perf = engine.getPerformance();
      
      expect(perf).to.have.property('currentBalance');
      expect(perf).to.have.property('profit');
      expect(perf).to.have.property('profitPercent');
      expect(perf).to.have.property('totalTrades');
      expect(perf.totalTrades).to.equal(2);
    });

    it('should track profit over time', async () => {
      // Make profitable trades
      await engine.buy('binance', 'BTC', 0.01, 50000);
      await engine.sell('coinbase', 'BTC', 0.01, 51000);
      
      const perf = engine.getPerformance();
      expect(perf.profit).to.be.greaterThan(0);
    });

    it('should calculate win rate', async () => {
      // Win trade
      await engine.buy('binance', 'BTC', 0.01, 50000);
      await engine.sell('coinbase', 'BTC', 0.01, 51000);
      
      // Loss trade
      await engine.buy('binance', 'ETH', 0.1, 3000);
      await engine.sell('coinbase', 'ETH', 0.1, 2900);
      
      const perf = engine.getPerformance();
      expect(perf).to.have.property('winRate');
      expect(perf.winRate).to.be.within(0, 100);
    });
  });

  describe('Fee Management', () => {
    it('should get fees for exchange', () => {
      const fees = engine.getFees('binance');
      expect(fees).to.be.an('object');
      expect(fees).to.have.property('maker');
      expect(fees).to.have.property('taker');
    });

    it('should set custom fees for exchange', () => {
      engine.setFees('test-exchange', { maker: 10, taker: 20 });
      const fees = engine.getFees('test-exchange');
      expect(fees.maker).to.equal(10);
      expect(fees.taker).to.equal(20);
    });

    it('should use default fees for unknown exchange', () => {
      const fees = engine.getFees('unknown-exchange');
      expect(fees.maker).to.equal(10);
      expect(fees.taker).to.equal(10);
    });
  });

  describe('State Persistence', () => {
    it('should save state to file', async () => {
      await engine.buy('binance', 'BTC', 0.01, 50000);
      
      // State should be auto-saved
      expect(existsSync(testFile)).to.be.true;
    });

    it('should restore state from file', async () => {
      // Make trade
      await engine.buy('binance', 'BTC', 0.01, 50000);
      const balanceBeforeRestart = engine.balance.USD;
      const tradesBefore = engine.trades.length;
      
      // Create new engine instance (simulates restart)
      const newEngine = new PaperTradingEngine('./config/fees.json', testFile, {
        persistentStateOptions: {
          autoSave: false,
          handleSignals: false
        }
      });
      
      try {
        expect(newEngine.balance.USD).to.equal(balanceBeforeRestart);
        expect(newEngine.trades.length).to.equal(tradesBefore);
      } finally {
        newEngine.dispose();
      }
    });
  });
});
