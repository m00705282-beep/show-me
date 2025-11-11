/* global describe, it, beforeEach */
/**
 * SlippageProtection Tests
 */

import { expect } from 'chai';
import { SlippageProtection } from '../optimization/slippageProtection.js';

describe('SlippageProtection', () => {
  let protection;

  beforeEach(() => {
    protection = new SlippageProtection({
      maxSlippage: 0.3,
      minNetSpreadAfterSlippage: 0.3
    });
    protection.resetStats();
  });

  it('estimates slippage with detailed breakdown', () => {
    const estimate = protection.estimateSlippage('BTC', 'binance', 'coinbase', 2000);

    expect(estimate).to.include.all.keys(
      'coin', 'buyExchange', 'sellExchange', 'tradeSize',
      'coinSlippage', 'exchangeSlippage', 'sizeImpact',
      'totalSlippage', 'breakdown'
    );
    expect(estimate.breakdown).to.have.property('total');
  });

  it('marks trade viable when spread covers slippage', () => {
    const opp = {
      coin: 'BTC',
      buyExchange: 'binance',
      sellExchange: 'coinbase',
      netSpread: 1.2
    };

    const result = protection.isTradeViable(opp, 1500);

    expect(result.viable).to.be.true;
    expect(result.netSpreadAfter).to.be.above(0.3);
    expect(protection.stats.accepted).to.equal(1);
    expect(protection.stats.rejected).to.equal(0);
  });

  it('rejects trade when slippage exceeds threshold', () => {
    const opp = {
      coin: 'SHIB',
      buyExchange: 'unknown',
      sellExchange: 'unknown',
      netSpread: 0.35
    };

    const result = protection.isTradeViable(opp, 5000);

    expect(result.viable).to.be.false;
    expect(result.reason).to.equal('SLIPPAGE_TOO_HIGH');
    expect(protection.stats.rejected).to.equal(1);
  });

  it('attempts to reduce trade size to make trade viable', () => {
    const opp = {
      coin: 'SOL',
      buyExchange: 'okx',
      sellExchange: 'binance',
      netSpread: 0.6
    };

    const recommendation = protection.adjustTradeSize(opp, 2000);
    expect(recommendation).to.include.all.keys(
      'originalSize',
      'adjustedSize',
      'reduction',
      'adjusted'
    );
    expect(recommendation.originalSize).to.equal(2000);
    expect(Number(recommendation.reduction)).to.be.at.least(0);
  });

  it('provides stats summary after evaluations', () => {
    const opp = {
      coin: 'ETH',
      buyExchange: 'binance',
      sellExchange: 'coinbase',
      netSpread: 0.8
    };

    protection.isTradeViable(opp, 500);
    protection.isTradeViable(opp, 4000);

    const stats = protection.getStats();
    expect(stats).to.have.property('totalChecked', 2);
    expect(stats).to.have.property('accepted');
    expect(stats).to.have.property('rejected');
    expect(stats).to.have.property('avgSlippage');
  });
});
