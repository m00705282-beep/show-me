#!/usr/bin/env node
import ccxt from 'ccxt';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;

console.log('\n🎯 CRO TRADE: AscendEX → Gate.io (3.08%)\n');

(async () => {
  try {
    const ascendex = new ccxt.ascendex({
      apiKey: config.exchanges.ascendex.apiKey,
      secret: config.exchanges.ascendex.secret,
      password: config.exchanges.ascendex.password,
      enableRateLimit: true
    });
    
    const gateio = new ccxt.gateio({
      apiKey: config.exchanges.gateio.apiKey,
      secret: config.exchanges.gateio.secret,
      enableRateLimit: true
    });
    
    const ticker = await ascendex.fetchTicker('CRO/USDT');
    const amount = TRADE_SIZE / ticker.last;
    
    console.log(`Trading ${amount.toFixed(4)} CRO for $${TRADE_SIZE}\n`);
    console.log('⏳ Executing...\n');
    
    // BUY
    console.log('📊 Buying on AscendEX...');
    const buy = await ascendex.createMarketBuyOrder('CRO/USDT', amount);
    console.log(`✅ Buy @ $${buy.average.toFixed(6)} | Fee: $${(buy.fee?.cost || 0).toFixed(4)}`);
    
    // SELL
    console.log('\n📊 Selling on Gate.io...');
    let sell;
    try {
      sell = await gateio.createMarketSellOrder('CRO/USDT', buy.filled);
      console.log(`✅ Sell @ $${sell.average.toFixed(6)} | Fee: $${(sell.fee?.cost || 0).toFixed(4)}`);
    } catch (e) {
      console.log('❌ Gate.io failed:', e.message);
      console.log('⚠️  Emergency: Selling on AscendEX...');
      sell = await ascendex.createMarketSellOrder('CRO/USDT', buy.filled);
      console.log(`✅ Sell @ $${sell.average.toFixed(6)}`);
    }
    
    // Profit
    const profit = (buy.filled * sell.average) - (buy.filled * buy.average) - 
                   (buy.fee?.cost || 0) - (sell.fee?.cost || 0);
    
    console.log('\n═══════════════════════════════════');
    if (profit > 0) {
      console.log(`💰 PROFIT: +$${profit.toFixed(2)}`);
    } else {
      console.log(`📉 LOSS: $${profit.toFixed(2)}`);
    }
    console.log('═══════════════════════════════════\n');
    
    // Log
    let logs = [];
    try {
      logs = JSON.parse(readFileSync('./logs/live-trades.json', 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn('⚠️  Could not read trade log:', e.message);
      }
    }
    logs.push({
      timestamp: new Date().toISOString(),
      coin: 'CRO',
      buyExchange: 'ascendex',
      sellExchange: sell.info ? 'gateio' : 'ascendex',
      profit
    });
    writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
    
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
  }
})();
