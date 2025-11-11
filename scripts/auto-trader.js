#!/usr/bin/env node

/**
 * 🤖 AUTO TRADER - Continuous monitoring and execution
 */

import ccxt from 'ccxt';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;
const MIN_SPREAD = 1.2; // Higher threshold for better success
const CHECK_INTERVAL = 45000; // 45 seconds
const MAX_TRADES = 5;

let trades = 0;
let totalProfit = 0;

console.clear();
console.log('\n🤖 AUTO TRADER - Monitoring Mode\n');
console.log('Settings:');
console.log(`  Trade Size: $${TRADE_SIZE}`);
console.log(`  Min Spread: ${MIN_SPREAD}%`);
console.log(`  Max Trades: ${MAX_TRADES}`);
console.log(`  Interval:   ${CHECK_INTERVAL/1000}s\n`);
console.log('═'.repeat(50));

const EXCHANGES_WITH_BALANCE = ['ascendex', 'binance', 'kraken', 'mexc', 'gateio', 'kucoin'];

async function findTrade() {
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  
  const opportunities = data.spreads
    .filter(s => 
      s.netSpread >= MIN_SPREAD &&
      EXCHANGES_WITH_BALANCE.includes(s.buyM) &&
      EXCHANGES_WITH_BALANCE.includes(s.sellM)
    )
    .sort((a, b) => b.netSpread - a.netSpread);
  
  for (const opp of opportunities) {
    const { buyM, sellM } = opp;
    
    const buyEx = config.exchanges[buyM];
    const sellEx = config.exchanges[sellM];
    
    if (!buyEx?.enabled || !sellEx?.enabled) continue;
    
    try {
      const exchange = new ccxt[buyM]({
        apiKey: buyEx.apiKey,
        secret: buyEx.secret,
        password: buyEx.password || buyEx.passphrase,
        enableRateLimit: true
      });
      
      const bal = await exchange.fetchBalance();
      if ((bal.USDT?.free || 0) >= TRADE_SIZE) {
        return opp;
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
}

async function executeTrade(opp) {
  const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
  
  trades++;
  console.log(`\n[${new Date().toLocaleTimeString()}] 🎯 Trade #${trades}: ${coin} ${netSpread.toFixed(2)}%`);
  console.log(`  ${buyM} @ $${buyP.toFixed(6)} → ${sellM} @ $${sellP.toFixed(6)}`);
  
  try {
    const buyExchange = new ccxt[buyM]({
      apiKey: config.exchanges[buyM].apiKey,
      secret: config.exchanges[buyM].secret,
      password: config.exchanges[buyM].password,
      enableRateLimit: true
    });
    
    const sellExchange = new ccxt[sellM]({
      apiKey: config.exchanges[sellM].apiKey,
      secret: config.exchanges[sellM].secret,
      password: config.exchanges[sellM].password,
      enableRateLimit: true
    });
    
    const amount = TRADE_SIZE / buyP;
    
    // BUY
    const buy = await buyExchange.createMarketBuyOrder(`${coin}/USDT`, amount);
    console.log(`  ✅ Buy @ $${buy.average.toFixed(6)}`);
    
    // SELL
    let sell;
    try {
      sell = await sellExchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
      console.log(`  ✅ Sell @ $${sell.average.toFixed(6)}`);
    } catch (e) {
      console.log(`  ⚠️  Fallback to ${buyM}`);
      sell = await buyExchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
    }
    
    const profit = (buy.filled * sell.average) - (buy.filled * buy.average) - 
                   (buy.fee?.cost || 0) - (sell.fee?.cost || 0);
    
    totalProfit += profit;
    
    console.log(`  ${profit > 0 ? '💰' : '📉'} ${profit > 0 ? '+' : ''}$${profit.toFixed(2)}`);
    console.log(`  📊 Session: ${trades}/${MAX_TRADES} | Total: $${totalProfit.toFixed(2)}`);
    
    // Log
    let logs = [];
    try {
      logs = JSON.parse(readFileSync('./logs/live-trades.json', 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(`  ⚠️  Could not read trade log: ${e.message}`);
      }
    }
    logs.push({
      timestamp: new Date().toISOString(),
      coin,
      buyExchange: buyM,
      sellExchange: sellM,
      profit
    });
    writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
    
  } catch (err) {
    console.log(`  ❌ Failed: ${err.message}`);
  }
}

async function monitor() {
  console.log(`\n[${new Date().toLocaleTimeString()}] 🔍 Scanning...`);
  
  if (trades >= MAX_TRADES) {
    console.log('\n═'.repeat(50));
    console.log(`\n🎉 SESSION COMPLETE!`);
    console.log(`  Trades: ${trades}`);
    console.log(`  Profit: $${totalProfit.toFixed(2)}`);
    console.log(`  Avg:    $${(totalProfit/trades).toFixed(2)}\n`);
    process.exit(0);
  }
  
  try {
    const trade = await findTrade();
    
    if (trade) {
      await executeTrade(trade);
    } else {
      console.log(`  ⏭️  No opportunities >= ${MIN_SPREAD}%`);
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
  
  setTimeout(monitor, CHECK_INTERVAL);
}

console.log(`\n🚀 Starting in 5 seconds...\n`);
setTimeout(() => {
  console.log('═'.repeat(50));
  monitor();
}, 5000);
