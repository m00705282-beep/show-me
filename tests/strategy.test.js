/* global describe, it, beforeEach, afterEach */
/**
 * Arbitrage Strategy Tests
 */

import { expect } from 'chai';
import { ArbitrageStrategy } from '../trading/arbitrageStrategy.js';
import { unlinkSync, existsSync } from 'fs';

describe('ArbitrageStrategy', () => {
  let strategy;
  const testFile = './data/test-strategy.json';

  beforeEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
    strategy = new ArbitrageStrategy({
      minSpread: 0.5,
      maxTradeSize: 1000,
      paperEngineConfig: {
        stateFile: testFile,
        options: {
          persistentStateOptions: {
            autoSave: false,
            handleSignals: false
          }
        }
      }
    });
    // Redirect persistent state to test file
    strategy.paperEngine.balance.USD = 10000;
    strategy.start();
  });

  afterEach(() => {
    strategy.stop();
    strategy.dispose();
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  describe('Opportunity Analysis', () => {
    it('should identify profitable opportunity', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 51000,
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5
      };

      const result = await strategy.analyzeOpportunity(opportunity);
      expect(result).to.be.an('object');
      expect(result.recommended).to.be.true;
      expect(result.execution?.success).to.be.true;
    });

    it('should reject low-spread opportunity', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 50100,
        buyP: 50000,
        sellP: 50100,
        netSpread: 0.2
      };

      const result = await strategy.analyzeOpportunity(opportunity);
      expect(result.recommended).to.be.false;
      expect(result.reason).to.include('spread');
      expect(result.execution).to.be.null;
    });

    it('should calculate trade size correctly', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 51000,
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5
      };

      const result = await strategy.analyzeOpportunity(opportunity);
      expect(result).to.have.property('tradeSize');
      expect(result.tradeSize).to.be.lessThanOrEqual(strategy.maxTradeSize);
    });
  });

  describe('Trade Execution', () => {
    it('should execute arbitrage trade', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5,
        tradeSize: 0.01
      };

      const result = await strategy.executeArbitrage(opportunity, opportunity.tradeSize);
      expect(result).to.be.an('object');
      expect(result.success).to.be.true;
      expect(result).to.have.property('netProfit');
    });

    it('should track trades executed', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5,
        tradeSize: 0.01
      };

      await strategy.executeArbitrage(opportunity, opportunity.tradeSize);

      const performance = strategy.getPerformance();
      expect(performance.tradesExecuted).to.be.greaterThan(0);
    });
  });

  describe('Performance Tracking', () => {
    it('should track opportunities analyzed', async () => {
      const opportunity = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 51000,
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5
      };

      await strategy.analyzeOpportunity(opportunity);
      await strategy.analyzeOpportunity(opportunity);

      const performance = strategy.getPerformance();
      expect(performance.opportunitiesAnalyzed).to.be.greaterThan(0);
    });

    it('should calculate execution rate', async () => {
      const goodOpp = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 51000,
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5,
        tradeSize: 0.01
      };
      
      const badOpp = {
        coin: 'ETH',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 3000,
        sellPrice: 3010,
        buyP: 3000,
        sellP: 3010,
        netSpread: 0.2
      };

      await strategy.analyzeOpportunity(goodOpp);
      await strategy.analyzeOpportunity(badOpp);
      await strategy.executeArbitrage(goodOpp, goodOpp.tradeSize);

      const performance = strategy.getPerformance();
      expect(performance).to.have.property('executionRate');
      expect(performance.executionRate).to.be.greaterThan(0);
    });

    it('should provide comprehensive performance metrics', async () => {
      const performance = strategy.getPerformance();
      expect(performance).to.have.property('currentBalance');
      expect(performance).to.have.property('profit');
      expect(performance).to.have.property('profitPercent');
      expect(performance).to.have.property('totalTrades');
      expect(performance).to.have.property('opportunitiesAnalyzed');
      expect(performance).to.have.property('tradesExecuted');
      expect(performance).to.have.property('executionRate');
    });
  });

  describe('Risk Management', () => {
    it('should respect max trade size', async () => {
      const largeOpp = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 51000,
        buyP: 50000,
        sellP: 51000,
        netSpread: 1.5
      };
      
      const result = await strategy.analyzeOpportunity(largeOpp);
      expect(result.tradeSize).to.be.lessThanOrEqual(strategy.maxTradeSize);
    });

    it('should respect min spread threshold', async () => {
      const lowSpreadOpp = {
        coin: 'BTC',
        buyExchange: 'binance',
        sellExchange: 'coinbase',
        buyPrice: 50000,
        sellPrice: 50100,
        buyP: 50000,
        sellP: 50100,
        netSpread: 0.2
      };
      
      const result = await strategy.analyzeOpportunity(lowSpreadOpp);
      expect(result.recommended).to.be.false;
      expect(result.reason).to.include('spread');
      expect(result.execution).to.be.null;
    });
  });
});
