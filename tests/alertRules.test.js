/* global describe, it, beforeEach */
/**
 * Alert Rules Engine Tests
 */

import { expect } from 'chai';
import { AlertRulesEngine } from '../monitoring/alertRules.js';

describe('AlertRulesEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AlertRulesEngine({});
  });

  describe('Balance Rules', () => {
    it('should detect balance drop', () => {
      engine.rules.balance.dropPercent = 5;
      const result = engine.evaluateBalance(9000, 10000);
      expect(result).to.be.an('object');
      expect(result.type).to.equal('balance_drop');
      expect(result.severity).to.equal('high');
    });

    it('should not alert for small balance changes', () => {
      const result = engine.evaluateBalance(9950, 10000);
      expect(result).to.be.null;
    });

    it('should detect low balance', () => {
      engine.rules.balance.dropPercent = 200;
      engine.rules.balance.minBalance = 200;
      const result = engine.evaluateBalance(50, 100);
      expect(result).to.be.an('object');
      expect(result.type).to.equal('balance_low');
    });

    it('should detect large balance gain', () => {
      const result = engine.evaluateBalance(12500, 10000);
      expect(result).to.be.an('object');
      expect(result.type).to.equal('balance_gain');
    });
  });

  describe('Opportunity Rules', () => {
    it('should detect high-profit opportunity', () => {
      const opp = {
        coin: 'BTC',
        netSpread: 3.5,
        qualityScore: 75
      };
      
      // Need consecutive opportunities
      engine.evaluateOpportunity(opp);
      engine.evaluateOpportunity(opp);
      const result = engine.evaluateOpportunity(opp);
      
      expect(result).to.be.an('array');
      expect(result[0].type).to.equal('high_profit_opportunity');
    });

    it('should detect quality opportunity', () => {
      const opp = {
        coin: 'ETH',
        netSpread: 1.5,
        qualityScore: 80
      };
      
      const result = engine.evaluateOpportunity(opp);
      expect(result).to.be.an('array');
      expect(result.some(r => r.type === 'quality_opportunity')).to.be.true;
    });
  });

  describe('Exchange Health Rules', () => {
    it('should detect exchange down', () => {
      const status = {
        status: 'unhealthy',
        lastSuccess: Date.now() - 20 * 60 * 1000, // 20 min ago
        successRate: 0.3,
        avgLatency: 3000
      };
      
      const result = engine.evaluateExchangeHealth('binance', status);
      expect(result).to.be.an('array');
      expect(result.some(r => r.type === 'exchange_down')).to.be.true;
    });

    it('should detect high latency', () => {
      const status = {
        status: 'healthy',
        lastSuccess: Date.now(),
        successRate: 0.9,
        avgLatency: 6000
      };
      
      const result = engine.evaluateExchangeHealth('kraken', status);
      expect(result).to.be.an('array');
      expect(result.some(r => r.type === 'exchange_high_latency')).to.be.true;
    });
  });

  describe('Rule Management', () => {
    it('should update rule threshold', () => {
      const success = engine.updateRule('balance', 'dropPercent', 15);
      expect(success).to.be.true;
      expect(engine.rules.balance.dropPercent).to.equal(15);
    });

    it('should toggle rule category', () => {
      engine.toggleCategory('balance', false);
      expect(engine.rules.balance.enabled).to.be.false;
      
      engine.toggleCategory('balance', true);
      expect(engine.rules.balance.enabled).to.be.true;
    });

    it('should export rules to JSON', () => {
      const json = engine.exportRules();
      expect(json).to.be.a('string');
      const parsed = JSON.parse(json);
      expect(parsed).to.have.property('balance');
      expect(parsed).to.have.property('opportunity');
    });
  });
});
