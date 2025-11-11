#!/usr/bin/env node

/**
 * 🎯 NEXT BEST TRADE - Quick execution
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;

console.clear();
console.log(chalk.cyan.bold('\n🎯 EXECUTING NEXT BEST TRADE...\n'));

async function executeNextTrade() {
  // Get opportunities
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  
  const opportunities = data.spreads
    .filter(s => s.netSpread >= 1.0)
    .sort((a, b) => b.netSpread - a.netSpread);
  
  console.log(chalk.yellow(`Found ${opportunities.length} opportunities >1%:\n`));
  
  // Check balances and find executable
  for (const opp of opportunities) {
    const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
    
    const buyEx = config.exchanges[buyM];
    const sellEx = config.exchanges[sellM];
    
    if (!buyEx?.enabled || !buyEx?.apiKey || !sellEx?.enabled || !sellEx?.apiKey) continue;
    
    try {
      // Check buy exchange balance
      const exchange = new ccxt[buyM]({
        apiKey: buyEx.apiKey,
        secret: buyEx.secret,
        password: buyEx.password || buyEx.passphrase,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
      });
      
      const bal = await exchange.fetchBalance();
      const usdt = bal['USDT']?.free || 0;
      
      if (usdt < TRADE_SIZE) {
        console.log(chalk.gray(`⏭️  ${coin} ${netSpread.toFixed(2)}% - ${buyM} insufficient ($${usdt.toFixed(2)})`));
        continue;
      }
      
      // Found executable trade!
      console.log(chalk.green.bold(`\n✅ EXECUTING: ${coin} ${netSpread.toFixed(2)}%`));
      console.log(chalk.white(`   ${buyM} @ $${buyP.toFixed(6)} → ${sellM} @ $${sellP.toFixed(6)}`));
      console.log(chalk.white(`   Expected: $${((TRADE_SIZE * netSpread / 100) * 0.6).toFixed(2)}\n`));
      
      // Init sell exchange
      const sellExchange = new ccxt[sellM]({
        apiKey: sellEx.apiKey,
        secret: sellEx.secret,
        password: sellEx.password || sellEx.passphrase,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
      });
      
      const amount = TRADE_SIZE / buyP;
      
      // Execute
      console.log(chalk.yellow('⏳ Executing...'));
      
      // BUY
      const buyOrder = await exchange.createMarketBuyOrder(`${coin}/USDT`, amount);
      console.log(chalk.green(`✅ Buy filled @ $${(buyOrder.average || buyP).toFixed(6)}`));
      
      const actualAmount = buyOrder.filled || amount;
      
      // SELL (with fallback)
      let sellOrder = null;
      let sellExchangeUsed = sellExchange;
      let sellExchangeName = sellM;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          sellOrder = await sellExchangeUsed.createMarketSellOrder(`${coin}/USDT`, actualAmount);
          console.log(chalk.green(`✅ Sell filled @ $${(sellOrder.average || sellP).toFixed(6)}`));
          break;
        } catch (err) {
          if (attempt === 2) {
            // Fallback to buy exchange
            console.log(chalk.yellow(`⚠️  Selling on ${buyM} instead...`));
            sellOrder = await exchange.createMarketSellOrder(`${coin}/USDT`, actualAmount);
            sellExchangeUsed = exchange;
            sellExchangeName = buyM;
            console.log(chalk.green(`✅ Sell filled @ $${sellOrder.average.toFixed(6)}`));
            break;
          }
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      
      // Results
      const buyTotal = actualAmount * (buyOrder.average || buyP);
      const sellTotal = actualAmount * (sellOrder.average || sellP);
      const fees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
      const profit = sellTotal - buyTotal - fees;
      const roi = (profit / TRADE_SIZE) * 100;
      
      console.log(chalk.cyan('\n═════════════════════════════════════'));
      if (profit > 0) {
        console.log(chalk.green.bold(`💰 PROFIT: +$${profit.toFixed(2)} (${roi.toFixed(2)}%)`));
      } else {
        console.log(chalk.red.bold(`📉 LOSS: $${profit.toFixed(2)} (${roi.toFixed(2)}%)`));
      }
      console.log(chalk.cyan('═════════════════════════════════════\n'));
      
      console.log(chalk.gray(`Buy:  $${buyTotal.toFixed(2)}`));
      console.log(chalk.gray(`Sell: $${sellTotal.toFixed(2)}`));
      console.log(chalk.gray(`Fees: $${fees.toFixed(4)}\n`));
      
      // Log
      const log = {
        timestamp: new Date().toISOString(),
        coin,
        buyExchange: buyM,
        sellExchange: sellExchangeName,
        tradeSize: TRADE_SIZE,
        coinAmount: actualAmount,
        buyPrice: buyOrder.average || buyP,
        sellPrice: sellOrder.average || sellP,
        fees,
        profit,
        roi,
        buyOrderId: buyOrder.id,
        sellOrderId: sellOrder.id
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
      
      console.log(chalk.green('✅ Trade logged!\n'));
      
      return;
      
    } catch (err) {
      console.log(chalk.red(`❌ ${coin} failed: ${err.message}`));
      continue;
    }
  }
  
  console.log(chalk.red('\n❌ No executable trades found.\n'));
}

executeNextTrade().catch(err => {
  console.error(chalk.red('\n💥 Error:'), err.message);
  process.exit(1);
});
