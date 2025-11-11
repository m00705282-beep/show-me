#!/usr/bin/env node

/**
 * 🎯 UNIVERSAL SAFE TRADE - Smart balance checking
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║         🎯 UNIVERSAL SAFE TRADE EXECUTOR 🎯              ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;

// Get all opportunities with sufficient balances
async function findBestTrade() {
  console.log(chalk.yellow('📡 Fetching opportunities and checking balances...\n'));
  
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  
  const goodOpps = data.spreads.filter(s => s.netSpread > 0.8);
  
  console.log(chalk.gray(`Found ${goodOpps.length} opportunities with >0.8% spread\n`));
  
  // Check each opportunity
  for (const opp of goodOpps) {
    const { coin, buyM, sellM, netSpread } = opp;
    
    // Check if exchanges are configured
    const buyEx = config.exchanges[buyM];
    const sellEx = config.exchanges[sellM];
    
    if (!buyEx || !buyEx.enabled || !buyEx.apiKey) continue;
    if (!sellEx || !sellEx.enabled || !sellEx.apiKey) continue;
    
    try {
      // Init buy exchange
      const buyExchange = new ccxt[buyM]({
        apiKey: buyEx.apiKey,
        secret: buyEx.secret,
        password: buyEx.password || buyEx.passphrase,
        enableRateLimit: true,
        options: { defaultType: 'spot' }
      });
      
      // Check balance
      const bal = await buyExchange.fetchBalance();
      const usdt = bal['USDT']?.free || 0;
      
      if (usdt >= TRADE_SIZE) {
        console.log(chalk.green(`✅ FOUND: ${coin} ${netSpread.toFixed(2)}% (${buyM} → ${sellM})`));
        console.log(chalk.gray(`   ${buyM} has $${usdt.toFixed(2)} USDT\n`));
        return opp;
      } else {
        console.log(chalk.gray(`⏭️  Skip: ${coin} ${netSpread.toFixed(2)}% - ${buyM} only has $${usdt.toFixed(2)}`));
      }
    } catch (err) {
      console.log(chalk.red(`❌ Error checking ${buyM}: ${err.message}`));
    }
  }
  
  return null;
}

// Execute trade
async function executeTrade(opp) {
  const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
  
  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold(`🎯 EXECUTING: ${coin}`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.white(`Spread:     ${netSpread.toFixed(2)}%`));
  console.log(chalk.white(`Size:       $${TRADE_SIZE}`));
  console.log(chalk.white(`Buy:        ${buyM} @ $${buyP.toFixed(6)}`));
  console.log(chalk.white(`Sell:       ${sellM} @ $${sellP.toFixed(6)}`));
  
  const expected = (TRADE_SIZE * netSpread / 100) * 0.6;
  console.log(chalk.green(`Expected:   $${expected.toFixed(2)}\n`));
  
  // Init
  const buyExchange = new ccxt[buyM]({
    apiKey: config.exchanges[buyM].apiKey,
    secret: config.exchanges[buyM].secret,
    password: config.exchanges[buyM].password || config.exchanges[buyM].passphrase,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
  });
  
  const sellExchange = new ccxt[sellM]({
    apiKey: config.exchanges[sellM].apiKey,
    secret: config.exchanges[sellM].secret,
    password: config.exchanges[sellM].password || config.exchanges[sellM].passphrase,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
  });
  
  // Verify markets
  console.log(chalk.yellow('🔍 Verifying markets...\n'));
  await buyExchange.loadMarkets();
  await sellExchange.loadMarkets();
  
  const pair = `${coin}/USDT`;
  if (!buyExchange.markets[pair] || !sellExchange.markets[pair]) {
    throw new Error(`${pair} not available on both exchanges`);
  }
  
  console.log(chalk.green('✅ Markets OK!'));
  
  const amount = TRADE_SIZE / buyP;
  console.log(chalk.yellow(`\n💰 Trading ${amount.toFixed(4)} ${coin}\n`));
  
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
  console.log(chalk.red.bold('\n⚠️  EXECUTING IN 5 SECONDS!\n'));
  console.log(chalk.white(`${buyM} → ${sellM}`));
  console.log(chalk.white(`Press Ctrl+C to CANCEL!\n`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  for (let i = 5; i > 0; i--) {
    process.stdout.write(chalk.yellow(`${i}... `));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(chalk.green('\n\n✅ GO!\n'));
  
  try {
    // BUY
    console.log(chalk.cyan(`📊 Buying ${amount.toFixed(4)} ${coin} on ${buyM}...`));
    const buyOrder = await buyExchange.createMarketBuyOrder(pair, amount);
    
    console.log(chalk.green('✅ Buy filled!'));
    console.log(chalk.gray(`   Price: $${(buyOrder.average || buyP).toFixed(6)}`));
    console.log(chalk.gray(`   Fee: $${(buyOrder.fee?.cost || 0).toFixed(4)}`));
    
    const actualAmount = buyOrder.filled || amount;
    
    // SELL
    console.log(chalk.cyan(`\n📊 Selling ${actualAmount.toFixed(4)} ${coin} on ${sellM}...`));
    
    let sellOrder = null;
    let attempts = 0;
    
    while (!sellOrder && attempts < 3) {
      try {
        attempts++;
        console.log(chalk.yellow(`   Attempt ${attempts}/3...`));
        
        sellOrder = await sellExchange.createMarketSellOrder(pair, actualAmount);
        
        console.log(chalk.green('✅ Sell filled!'));
        console.log(chalk.gray(`   Price: $${(sellOrder.average || sellP).toFixed(6)}`));
        console.log(chalk.gray(`   Fee: $${(sellOrder.fee?.cost || 0).toFixed(4)}`));
      } catch (err) {
        console.error(chalk.red(`   ❌ Failed: ${err.message}`));
        
        if (attempts >= 3) {
          console.error(chalk.red.bold(`\n🚨 ${coin} stuck on ${buyM}!`));
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Results
    const buyTotal = actualAmount * (buyOrder.average || buyP);
    const sellTotal = actualAmount * (sellOrder.average || sellP);
    const fees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const profit = sellTotal - buyTotal - fees;
    const roi = (profit / TRADE_SIZE) * 100;
    
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.green.bold('🎉 COMPLETED!'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Buy:   $${buyTotal.toFixed(2)}`));
    console.log(chalk.white(`Sell:  $${sellTotal.toFixed(2)}`));
    console.log(chalk.white(`Fees:  $${fees.toFixed(4)}`));
    
    if (profit > 0) {
      console.log(chalk.green.bold(`\nProfit: $${profit.toFixed(2)} ✅`));
      console.log(chalk.green(`ROI:    +${roi.toFixed(2)}%\n`));
    } else {
      console.log(chalk.red.bold(`\nLoss:   $${profit.toFixed(2)} ❌`));
      console.log(chalk.red(`ROI:    ${roi.toFixed(2)}%\n`));
    }
    
    // Log
    const log = {
      timestamp: new Date().toISOString(),
      coin,
      buyExchange: buyM,
      sellExchange: sellM,
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
    
    console.log(chalk.gray('✅ Logged!\n'));
    
    return log;
    
  } catch (err) {
    console.error(chalk.red('\n❌ Failed:'), err.message);
    throw err;
  }
}

// Main
async function main() {
  try {
    const bestTrade = await findBestTrade();
    
    if (!bestTrade) {
      console.log(chalk.red('\n❌ No valid trades found with sufficient balances.\n'));
      process.exit(0);
    }
    
    await executeTrade(bestTrade);
    
    console.log(chalk.green.bold('✅ DONE! 🎉\n'));
    
  } catch (err) {
    console.error(chalk.red('\n💥 Error:'), err.message);
    process.exit(1);
  }
}

main();
