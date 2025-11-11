/**
 * Automatic Fee Verification System
 * Checks exchange fees every 2 weeks and alerts if changes detected
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Official fee sources (manual verification required)
const FEE_SOURCES = {
  binance: 'https://www.binance.com/en/fee/schedule',
  kraken: 'https://www.kraken.com/features/fee-schedule',
  bitfinex: 'https://www.bitfinex.com/fees',
  kucoin: 'https://www.kucoin.com/vip/level',
  okx: 'https://www.okx.com/fees',
  gateio: 'https://www.gate.io/fee',
  huobi: 'https://www.huobi.com/support/en-us/detail/900000046163',
  gemini: 'https://www.gemini.com/fees/web-fee-schedule',
  poloniex: 'https://poloniex.com/fee-schedule',
  bybit: 'https://www.bybit.com/en/help-center/article/Trading-Fee-Structure',
  mexc: 'https://www.mexc.com/fee',
  bitget: 'https://www.bitget.com/support/articles/360033773791',
  coinex: 'https://www.coinex.com/fees',
  bitstamp: 'https://www.bitstamp.net/fee-schedule/',
  cryptocom: 'https://crypto.com/exchange/document/fees-limits',
  upbit: 'https://upbit.com/service_center/guide',
  bithumb: 'https://www.bithumb.com/customer_support/info_fee',
  coinone: 'https://coinone.co.kr/info/fee',
  hitbtc: 'https://hitbtc.com/fee-tier',
  indodax: 'https://indodax.com/fees',
  lbank: 'https://www.lbank.com/en-US/fee',
  probit: 'https://www.probit.com/en-us/fee-schedule'
};

class FeeVerificationSystem {
  constructor() {
    this.configPath = join(__dirname, '../config/fees.json');
    this.logPath = join(__dirname, '../data/fee-verification-log.json');
    this.config = null;
    this.log = [];
  }

  loadConfig() {
    try {
      this.config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      console.log('[fee-verify] Fee config loaded');
    } catch (err) {
      console.error('[fee-verify] Failed to load config:', err.message);
    }
  }

  loadLog() {
    try {
      this.log = JSON.parse(readFileSync(this.logPath, 'utf-8'));
    } catch (err) {
      this.log = [];
    }
  }

  saveLog() {
    try {
      writeFileSync(this.logPath, JSON.stringify(this.log, null, 2));
      console.log('[fee-verify] Log saved');
    } catch (err) {
      console.error('[fee-verify] Failed to save log:', err.message);
    }
  }

  getLastVerification() {
    if (this.log.length === 0) return null;
    return this.log[this.log.length - 1];
  }

  shouldVerify() {
    const lastVerification = this.getLastVerification();
    if (!lastVerification) return true;

    const lastDate = new Date(lastVerification.timestamp);
    const now = new Date();
    const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);

    return daysSince >= 14; // 2 weeks
  }

  generateVerificationReport() {
    const report = {
      timestamp: new Date().toISOString(),
      exchanges: [],
      needsManualVerification: true,
      sources: FEE_SOURCES
    };

    for (const [exchangeId, feeData] of Object.entries(this.config.exchanges)) {
      report.exchanges.push({
        exchange: exchangeId,
        maker: feeData.maker,
        taker: feeData.taker,
        source: FEE_SOURCES[exchangeId] || 'Unknown',
        lastUpdated: this.config.lastUpdated
      });
    }

    return report;
  }

  logVerification(report) {
    this.log.push(report);
    
    // Keep only last 12 verifications (6 months)
    if (this.log.length > 12) {
      this.log = this.log.slice(-12);
    }

    this.saveLog();
  }

  async verify() {
    console.log('[fee-verify] Starting fee verification...');
    
    this.loadConfig();
    this.loadLog();

    if (!this.shouldVerify()) {
      const lastVerification = this.getLastVerification();
      const lastDate = new Date(lastVerification.timestamp);
      const daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));
      console.log(`[fee-verify] Last verification was ${daysSince} days ago. Next verification in ${14 - daysSince} days.`);
      return;
    }

    const report = this.generateVerificationReport();
    this.logVerification(report);

    console.log('[fee-verify] ⚠️  MANUAL VERIFICATION REQUIRED');
    console.log('[fee-verify] Please verify fees at the following sources:');
    console.log('');
    
    for (const exchange of report.exchanges) {
      console.log(`  ${exchange.exchange}: ${exchange.source}`);
    }
    
    console.log('');
    console.log('[fee-verify] Current fees:');
    for (const exchange of report.exchanges) {
      console.log(`  ${exchange.exchange}: maker ${exchange.maker}bp, taker ${exchange.taker}bp`);
    }
    
    console.log('');
    console.log('[fee-verify] Update config/fees.json if changes detected');
    console.log('[fee-verify] Next verification: ' + new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  }

  getStatus() {
    this.loadLog();
    const lastVerification = this.getLastVerification();
    
    if (!lastVerification) {
      return {
        lastVerification: null,
        daysSinceLastVerification: null,
        nextVerification: 'Now',
        needsVerification: true
      };
    }

    const lastDate = new Date(lastVerification.timestamp);
    const now = new Date();
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    const nextVerification = new Date(lastDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    return {
      lastVerification: lastVerification.timestamp,
      daysSinceLastVerification: daysSince,
      nextVerification: nextVerification.toISOString().split('T')[0],
      needsVerification: daysSince >= 14
    };
  }
}

export { FeeVerificationSystem };
