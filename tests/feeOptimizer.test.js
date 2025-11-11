/* global describe, it, beforeEach */
/**
 * FeeOptimizer Tests
 */

import { expect } from 'chai';
import { FeeOptimizer } from '../optimization/feeOptimizer.js';

describe('FeeOptimizer', () => {
  let optimizer;

  const opportunity = {
    coin: 'BTC',
    buyM: 'binance',
    sellM: 'coinbase',
    buyP: 50000,
    sellP: 50500,
    netSpread: 1.0
  };

  beforeEach(() => {
    optimizer = new FeeOptimizer();
  });

  it('računa scenarije i bira najjeftiniju rutu', () => {
    const result = optimizer.optimizeRoute(opportunity, 1000);

    expect(result).to.have.property('recommended');
    expect(result.recommended).to.have.property('type');
    expect(result.recommended).to.have.property('totalFees');
    expect(result.alternatives).to.have.lengthOf(3);
    expect(result.feeSavings).to.be.at.least(0);
  });

  it('veštački smanjuje troškove maker nalogom kada ima smisla', () => {
    const analysis = optimizer.shouldUseLimitOrder(opportunity, 5000, 60000);
    expect(analysis).to.have.property('recommended');
    expect(analysis).to.have.property('reason');
  });

  it('pronalazi najjeftiniju mrežu za USDT', () => {
    const network = optimizer.findCheapestNetwork('USDT');
    expect(network).to.have.property('network');
    expect(network).to.have.property('fee');
    expect(['TRC20', 'BEP20', 'ERC20']).to.include(network.network);
    expect(network.fee).to.be.a('number');
  });

  it('računa kompletnu fee analizu', () => {
    const report = optimizer.getFeeReport(opportunity, 2000);
    expect(report).to.have.property('optimization');
    expect(report).to.have.nested.property('summary.netProfit');
  });
});
