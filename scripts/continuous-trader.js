#!/usr/bin/env node

/**
 * 🔄 CONTINUOUS TRADER
 * Neprekidno traži i izvršava profitable trade-ove
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;
const MIN_SPREAD = 1.0; // 1% minimum
const TRADE_INTERVAL = 60000; // Check every 60 seconds
const MAX_TRADES_PER_SESSION = 10;

let tradesExecuted = 0;
let totalProfit = 0;

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║          🔄 CONTINUOUS ARBITRAGE TRADER 🔄               ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

console.log(chalk.yellow(`Settings:`));
console.log(chalk.white(`  Trade Size:     $${TRADE_SIZE}`));
console.log(chalk.white(`  Min Spread:     ${MIN_SPREAD}%`));
console.log(chalk.white(`  Max Trades:     ${MAX_TRADES_PER_SESSION}`));
console.log(chalk.white(`  Check Interval: ${TRADE_INTERVAL/1000}s\n`));

// Find best executable trade
async function findExecutableTrade() {
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  
  const opportunities = data.spreads
    .filter(s => s.netSpread >= MIN_SPREAD)
    .sort((a, b) => b.netSpread - a.netSpread);
  
  // Check each opportunity for balance
  for (const opp of opportunities) {
    const { buyM, sellM } = opp;
    
    const buyEx = config.exchanges[buyM];
    const sellEx = config.exchanges[sellM];
    
    if (!buyEx || !buyEx.enabled || !buyEx.apiKey) continue;
    if (!sellEx || !sellEx.enabled || !sellEx.apiKey) continue;
    
    try {
      const exchange = new ccxt[buyM]({
        apiKey: buyEx.apiKey,
        secret: buyEx.secret,
        password: buyEx.password || buyEx.passphrase,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
      });
      
      const bal = await exchange.fetchBalance();
      const usdt = bal['USDT']?.free || 0;
      
      if (usdt >= TRADE_SIZE) {
        return opp;
      }
    } catch (err) {
      continue;
    }
  }
  
  return null;
}

// Execute trade
async function executeTrade(opp) {
  const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
  
  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold(`🎯 TRADE #${tradesExecuted + 1}: ${coin} (${netSpread.toFixed(2)}%)`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.gray(`${buyM} @ $${buyP.toFixed(6)} → ${sellM} @ $${sellP.toFixed(6)}`));
  
  try {
    const buyExchange = new ccxt[buyM]({
      apiKey: config.exchanges[buyM].apiKey,
      secret: config.exchanges[buyM].secret,
      password: config.exchanges[buyM].password,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    
    const sellExchange = new ccxt[sellM]({
      apiKey: config.exchanges[sellM].apiKey,
      secret: config.exchanges[sellM].secret,
      password: config.exchanges[sellM].password,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    
    const amount = TRADE_SIZE / buyP;
    
    console.log(chalk.yellow(`\n📊 Executing ${amount.toFixed(4)} ${coin}...`));
    
    // BUY
    const buyOrder = await buyExchange.createMarketBuyOrder(`${coin}/USDT`, amount);
    console.log(chalk.green(`✅ Buy: $${(buyOrder.average || buyP).toFixed(6)}`));
    
    const actualAmount = buyOrder.filled || amount;
    
    // SELL (with retry)
    let sellOrder = null;
    for (let i = 0; i < 3; i++) {
      try {
        sellOrder = await sellExchange.createMarketSellOrder(`${coin}/USDT`, actualAmount);
        console.log(chalk.green(`✅ Sell: $${(sellOrder.average || sellP).toFixed(6)}`));
        break;
      } catch (err) {
        if (i === 2) {
          // Emergency: sell on buy exchange
          console.log(chalk.red(`⚠️  Selling on ${buyM} instead...`));
          sellOrder = await buyExchange.createMarketSellOrder(`${coin}/USDT`, actualAmount);
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Calculate profit
    const buyTotal = actualAmount * (buyOrder.average || buyP);
    const sellTotal = actualAmount * (sellOrder.average || sellP);
    const fees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const profit = sellTotal - buyTotal - fees;
    
    tradesExecuted++;
    totalProfit += profit;
    
    if (profit > 0) {
      console.log(chalk.green.bold(`\n💰 Profit: +$${profit.toFixed(2)}`));
    } else {
      console.log(chalk.red.bold(`\n📉 Loss: $${profit.toFixed(2)}`));
    }
    
    console.log(chalk.cyan(`📊 Session: ${tradesExecuted}/${MAX_TRADES_PER_SESSION} trades | Total: $${totalProfit.toFixed(2)}\n`));
    
    // Log
    const log = {
      timestamp: new Date().toISOString(),
      tradeNumber: tradesExecuted,
      coin,
      buyExchange: buyM,
      sellExchange: sellM,
      buyPrice: buyOrder.average || buyP,
      sellPrice: sellOrder.average || sellP,
      amount: actualAmount,
      fees,
      profit
    };
    
    let logs = [];
    try {
      logs = JSON.parse(readFileSync('./logs/live-trades.json', 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(chalk.yellow(`⚠️  Could not read trade log: ${e.message}`));
      }
    }
    logs.push(log);
    writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
    
    return profit;
    
  } catch (err) {
    console.error(chalk.red(`❌ Error: ${err.message}\n`));
    return null;
  }
}

// Main loop
async function tradingLoop() {
  console.log(chalk.yellow(`\n⏰ ${new Date().toLocaleTimeString()} - Scanning...`));
  
  if (tradesExecuted >= MAX_TRADES_PER_SESSION) {
    console.log(chalk.green.bold('\n🎉 MAX TRADES REACHED!'));
    console.log(chalk.cyan(`\nSession Summary:`));
    console.log(chalk.white(`  Trades:  ${tradesExecuted}`));
    console.log(chalk.white(`  Profit:  $${totalProfit.toFixed(2)}`));
    console.log(chalk.white(`  Avg:     $${(totalProfit / tradesExecuted).toFixed(2)} per trade\n`));
    process.exit(0);
  }
  
  try {
    const trade = await findExecutableTrade();
    
    if (trade) {
      console.log(chalk.green(`✅ Found: ${trade.coin} ${trade.netSpread.toFixed(2)}%`));
      await executeTrade(trade);
    } else {
      console.log(chalk.gray('⏭️  No executable opportunities found'));
    }
  } catch (err) {
    console.error(chalk.red(`Error in loop: ${err.message}`));
  }
  
  // Wait before next check
  setTimeout(tradingLoop, TRADE_INTERVAL);
}

// Start
console.log(chalk.green.bold('🚀 Starting continuous trading...\n'));
tradingLoop();
