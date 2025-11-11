#!/usr/bin/env node
import ccxt from 'ccxt';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;
const MIN_SPREAD = 0.5; // Lower - accept any positive profit
const MAX_TRADES = 30;
const CHECK_INTERVAL = 20000; // 20s - faster

let trades = 0;
let totalProfit = 0;

console.log('\n💰 PROFIT HUNTER - Any positive trade!\n');
console.log(`Min spread: ${MIN_SPREAD}% | Trade size: $${TRADE_SIZE} | Max: ${MAX_TRADES}\n`);

const EXCHANGES = ['ascendex', 'binance', 'kraken', 'mexc', 'gateio', 'kucoin'];

async function hunt() {
  if (trades >= MAX_TRADES) {
    console.log(`\n✅ Done! ${trades} trades | Profit: $${totalProfit.toFixed(2)}\n`);
    process.exit(0);
  }

  try {
    const response = await fetch('http://localhost:8080/api/snapshot');
    const data = await response.json();
    
    const opps = data.spreads
      .filter(s => 
        s.netSpread >= MIN_SPREAD &&
        EXCHANGES.includes(s.buyM) &&
        EXCHANGES.includes(s.sellM)
      )
      .sort((a, b) => b.netSpread - a.netSpread);
    
    for (const opp of opps) {
      const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
      
      const buyEx = config.exchanges[buyM];
      const sellEx = config.exchanges[sellM];
      
      if (!buyEx?.enabled || !sellEx?.enabled) continue;
      
      try {
        const buyExchange = new ccxt[buyM]({
          apiKey: buyEx.apiKey,
          secret: buyEx.secret,
          password: buyEx.password || buyEx.passphrase,
          enableRateLimit: true
        });
        
        const bal = await buyExchange.fetchBalance();
        if ((bal.USDT?.free || 0) < TRADE_SIZE) continue;
        
        const sellExchange = new ccxt[sellM]({
          apiKey: sellEx.apiKey,
          secret: sellEx.secret,
          password: sellEx.password || sellEx.passphrase,
          enableRateLimit: true
        });
        
        trades++;
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] #${trades}: ${coin} ${netSpread.toFixed(2)}% (${buyM}->${sellM})`);
        
        const amount = TRADE_SIZE / buyP;
        
        const buy = await buyExchange.createMarketBuyOrder(`${coin}/USDT`, amount);
        console.log(`  Buy price  → actual $${buy.average.toFixed(6)} (expected $${buyP.toFixed(6)})`);
        
        let sell;
        let actualSellM = sellM;
        try {
          sell = await sellExchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
        } catch (e) {
          sell = await buyExchange.createMarketSellOrder(`${coin}/USDT`, buy.filled);
          actualSellM = buyM;
        }
        console.log(`  Sell price → actual $${sell.average.toFixed(6)} (expected $${sellP.toFixed(6)})`);
        
        const profit = (buy.filled * sell.average) - (buy.filled * buy.average) - 
                       (buy.fee?.cost || 0) - (sell.fee?.cost || 0);
        
        totalProfit += profit;
        
        const emoji = profit > 0 ? '💰' : '📉';
        const sign = profit > 0 ? '+' : '';
        console.log(`  ${emoji} ${sign}$${profit.toFixed(2)} | Total: $${totalProfit.toFixed(2)}\n`);
        
        let logs = [];
        try {
          logs = JSON.parse(readFileSync('./logs/live-trades.json', 'utf8'));
        } catch(e) {
          if (e.code !== 'ENOENT') {
            console.warn(`  ⚠️  Could not read trade log: ${e.message}`);
          }
        }
        logs.push({
          timestamp: new Date().toISOString(),
          coin,
          buyExchange: buyM,
          sellExchange: actualSellM,
          profit,
          spread: netSpread
        });
        writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
        
        setTimeout(hunt, CHECK_INTERVAL);
        return;
        
      } catch (err) {
        continue;
      }
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] Waiting... (no opps >=${MIN_SPREAD}%)`);
    setTimeout(hunt, CHECK_INTERVAL);
    
  } catch (err) {
    setTimeout(hunt, CHECK_INTERVAL);
  }
}

hunt();
