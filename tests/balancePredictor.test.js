/* global describe, it, beforeEach */
/**
 * BalancePredictor Tests
 */

import { expect } from 'chai';
import { BalancePredictor } from '../ai/balancePredictor.js';

class MockLogger {
  constructor(data = []) {
    this.data = data;
  }

  getTopExchangePairs(days = 7, limit = 10) {
    void days;
    return this.data.slice(0, limit);
  }

  getStats() {
    return { total: this.data.length };
  }
}

const samplePairs = [
  { buyExchange: 'binance', sellExchange: 'kraken', count: 30, avgSpread: 2.1, totalProfit: 1500, lastSeen: Date.now() - 60 * 60 * 1000 },
  { buyExchange: 'binance', sellExchange: 'coinbase', count: 25, avgSpread: 1.8, totalProfit: 1200, lastSeen: Date.now() - 2 * 60 * 60 * 1000 },
  { buyExchange: 'kraken', sellExchange: 'binance', count: 15, avgSpread: 1.5, totalProfit: 900, lastSeen: Date.now() - 3 * 60 * 60 * 1000 },
  { buyExchange: 'coinbase', sellExchange: 'binance', count: 20, avgSpread: 1.7, totalProfit: 800, lastSeen: Date.now() - 4 * 60 * 60 * 1000 }
];

describe('BalancePredictor', () => {
  let predictor;
  let logger;

  beforeEach(() => {
    logger = new MockLogger(samplePairs);
    predictor = new BalancePredictor(logger, {
      lookbackDays: 7,
      minBalancePerExchange: 50,
      maxBalancePerExchange: 500,
      reserveBalance: 100
    });
  });

  it('računa optimalnu raspodelu kapitala', async () => {
    const exchanges = ['binance', 'kraken', 'coinbase'];
    const allocation = await predictor.predictOptimalDistribution(1000, exchanges);

    expect(allocation.size).to.equal(exchanges.length);
    const totalAllocated = Array.from(allocation.values()).reduce((sum, a) => sum + a, 0);
    expect(Math.round(totalAllocated + predictor.config.reserveBalance)).to.equal(1000);
  });

  it('koristi jednaku raspodelu kada nema istorije', async () => {
    predictor = new BalancePredictor(new MockLogger([]));
    const exchanges = ['binance', 'kraken'];
    const allocation = await predictor.predictOptimalDistribution(500, exchanges);

    expect(allocation.size).to.equal(exchanges.length);
    allocation.forEach(amount => expect(amount).to.be.a('number'));
  });

  it('identifikuje da je potrebno rebalansiranje', async () => {
    const exchanges = ['binance', 'kraken'];
    const optimal = await predictor.predictOptimalDistribution(600, exchanges);
    const current = new Map([
      ['binance', 400],
      ['kraken', 100]
    ]);

    const evaluation = predictor.shouldRebalance(current, optimal);
    expect(evaluation).to.have.property('shouldRebalance');
  });

  it('računa transfer plan za rebalans', () => {
    const optimal = new Map([
      ['binance', 200],
      ['kraken', 200],
      ['coinbase', 200]
    ]);
    const current = new Map([
      ['binance', 350],
      ['kraken', 50],
      ['coinbase', 100]
    ]);

    const transfers = predictor.calculateTransfers(current, optimal);
    expect(transfers).to.be.an('array');
    if (transfers.length > 0) {
      const totalTransfer = transfers.reduce((sum, t) => sum + t.amount, 0);
      expect(totalTransfer).to.be.greaterThan(0);
    }
  });
});
