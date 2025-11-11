/* global describe, it, beforeEach */
/**
 * MultiTradeExecutor Tests
 */

import { expect } from 'chai';
import { MultiTradeExecutor } from '../trading/multiTradeExecutor.js';

class MockEngine {
  constructor(sequence = []) {
    this.sequence = Array.isArray(sequence) ? sequence : [];
    this.calls = [];
    this.cancelCalled = false;
  }

  async executeTrade(opportunity, positionSize) {
    this.calls.push({ opportunity, positionSize });
    const next = this.sequence.length > 0 ? this.sequence.shift() : { success: true, profit: 0 };
    return typeof next === 'function' ? await next() : next;
  }

  cancelAllTrades() {
    this.cancelCalled = true;
  }
}

const waitFor = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe('MultiTradeExecutor', () => {
  let engine;
  let executor;

  beforeEach(() => {
    engine = new MockEngine();
    executor = new MultiTradeExecutor(engine, {
      maxConcurrentTrades: 2,
      maxQueueSize: 5,
      executionTimeout: 100,
      retryFailedTrades: true,
      maxRetries: 2
    });
  });

  it('queues and executes trades successfully', async () => {
    const opportunity = {
      coin: 'BTC',
      buyM: 'binance',
      sellM: 'coinbase',
      netSpread: 2.5,
      qualityScore: 80,
      expectedProfit: 12
    };

    const enqueue = await executor.queueTrade(opportunity, 50);
    expect(enqueue.success).to.be.true;

    await waitFor(20);

    expect(executor.stats.totalQueued).to.equal(1);
    expect(executor.stats.totalSuccessful).to.equal(1);
    expect(executor.queue.length).to.equal(0);
    expect(engine.calls).to.have.lengthOf(1);
  });

  it('rejects opportunities that conflict with active trades', async () => {
    executor.activeTradesInfo.set('trade_active', {
      coin: 'ETH',
      buyExchange: 'kraken',
      sellExchange: 'coinbase',
      startedAt: Date.now()
    });

    const conflictOpp = {
      coin: 'ETH',
      buyM: 'kraken',
      sellM: 'coinbase',
      netSpread: 3.1
    };

    const result = await executor.queueTrade(conflictOpp, 25);
    expect(result.success).to.be.false;
    expect(result.reason).to.include('Same coin');
  });

  it('retries failed trades until success', async () => {
    engine = new MockEngine([
      { success: false, error: 'temporary_error' },
      { success: true, profit: 7 }
    ]);

    executor = new MultiTradeExecutor(engine, {
      maxConcurrentTrades: 1,
      executionTimeout: 100,
      retryFailedTrades: true,
      maxRetries: 2
    });

    const opportunity = {
      coin: 'SOL',
      buyM: 'okx',
      sellM: 'binance',
      netSpread: 2.2
    };

    await executor.queueTrade(opportunity, 40);
    await waitFor(40);

    expect(engine.calls).to.have.lengthOf(2);
    expect(executor.stats.totalSuccessful).to.equal(1);
    expect(executor.stats.totalFailed).to.equal(0);
  });

  it('handles emergency stop by clearing queue and canceling active trades', async () => {
    engine = new MockEngine();
    executor = new MultiTradeExecutor(engine, {
      maxConcurrentTrades: 1,
      executionTimeout: 100
    });

    executor.queue.push({ id: 't1' });
    executor.queue.push({ id: 't2' });
    executor.activeTradesInfo.set('active1', {
      coin: 'BTC',
      buyExchange: 'binance',
      sellExchange: 'kraken',
      startedAt: Date.now()
    });

    const result = executor.emergencyStop();
    expect(result.success).to.be.true;
    expect(result.clearedQueue).to.equal(2);
    expect(result.canceledActive).to.equal(1);
    expect(executor.queue.length).to.equal(0);
    expect(engine.cancelCalled).to.be.true;
  });
});
