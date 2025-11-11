#!/usr/bin/env node
import ccxt from 'ccxt';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;
const MIN_SPREAD = 0.9; // Lower threshold - more aggressive
const MAX_TRADES = 20;

let trades = 0;
let totalProfit = 0;

console.log('\n🔥 AGGRESSIVE TRADER - Executing every 30s\n');

async function findAndExecute() {
  if (trades >= MAX_TRADES) {
    console.log(`\n✅ Completed ${trades} trades. Profit: $${totalProfit.toFixed(2)}\n`);
    process.exit(0);
  }

  try {
    const response = await fetch('http://localhost:8080/api/snapshot');
    const data = await response.json();
    
    const opps = data.spreads
      .filter(s => s.netSpread >= MIN_SPREAD)
      .sort((a, b) => b.netSpread - a.netSpread);
    
    for (const opp of opps) {
      const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
      
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
        if ((bal.USDT?.free || 0) < TRADE_SIZE) continue;
        
        trades++;
        console.log(`\n[${new Date().toLocaleTimeString()}] Trade #${trades}: ${coin} ${netSpread.toFixed(2)}% (${buyM}→${sellM})`);
        
        const sellExchange = new ccxt[sellM]({
          apiKey: sellEx.apiKey,
          secret: sellEx.secret,
          password: sellEx.password,
          enableRateLimit: true
        });
        
        const amount = TRADE_SIZE / buyP;
        
        const buy = await exchange.createMarketBuyOrder(`${coin}/USDT`, amount);
        console.log(`  Buy:  actual $${buy.average.toFixed(6)} (expected $${buyP.toFixed(6)})`);
        
        let sell;
        try {
          sell = await sellExchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
        } catch (e) {
          console.warn(`  ⚠️  Sell on ${sellM} failed (${e.message}). Falling back to ${buyM}.`);
          sell = await exchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
        }
        console.log(`  Sell: actual $${sell.average.toFixed(6)} (expected $${sellP.toFixed(6)})`);
        
        const profit = (buy.filled * sell.average) - (buy.filled * buy.average) - 
                       (buy.fee?.cost || 0) - (sell.fee?.cost || 0);
        
        totalProfit += profit;
        console.log(`  ${profit > 0 ? '💰' : '📉'} ${profit > 0 ? '+' : ''}$${profit.toFixed(2)} | Total: $${totalProfit.toFixed(2)}`);
        
        let logs = [];
        try {
          logs = JSON.parse(readFileSync('./logs/live-trades.json', 'utf8'));
        } catch (e) {
          if (e.code !== 'ENOENT') {
            console.warn(`  ⚠️  Could not read trade log: ${e.message}`);
          }
        }
        logs.push({ timestamp: new Date().toISOString(), coin, buyExchange: buyM, sellExchange: sellM, profit });
        writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
        
        return;
        
      } catch (err) {
        continue;
      }
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] No opportunities >= ${MIN_SPREAD}%`);
    
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
  
  setTimeout(findAndExecute, 30000);
}

findAndExecute();
