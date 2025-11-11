#!/usr/bin/env node

/**
 * 🚀 AUTO TRADE EXECUTOR
 * Automatski izvršava najbolju priliku sa confirmation
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║         🚀 AUTO ARBITRAGE TRADE EXECUTOR 🚀              ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

// Config
const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20; // $20 test trade

// Get opportunities
async function getOpportunities() {
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  return data.spreads.filter(s => s.netSpread > 0.8).sort((a, b) => b.netSpread - a.netSpread);
}

// Init exchange
function initExchange(exchangeId) {
  const cfg = config.exchanges[exchangeId];
  if (!cfg || !cfg.enabled || !cfg.apiKey || !cfg.secret) {
    throw new Error(`${exchangeId} not configured`);
  }
  
  const ExchangeClass = ccxt[exchangeId];
  return new ExchangeClass({
    apiKey: cfg.apiKey,
    secret: cfg.secret,
    password: cfg.password || cfg.passphrase,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
  });
}

// Execute trade
async function executeTrade(opp) {
  const { coin, buyM, sellM, buyP, sellP, netSpread } = opp;
  
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold(`🎯 EXECUTING: ${coin}`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.white(`Coin:         ${coin}`));
  console.log(chalk.white(`Spread:       ${netSpread.toFixed(2)}%`));
  console.log(chalk.white(`Trade Size:   $${TRADE_SIZE}`));
  console.log(chalk.white(`Buy from:     ${buyM} @ $${buyP.toFixed(6)}`));
  console.log(chalk.white(`Sell to:      ${sellM} @ $${sellP.toFixed(6)}`));
  
  const expectedProfit = (TRADE_SIZE * netSpread / 100) * 0.6;
  console.log(chalk.green(`Expected:     $${expectedProfit.toFixed(2)} profit\n`));
  
  // Init exchanges
  console.log(chalk.yellow('🔗 Connecting...\n'));
  const buyExchange = initExchange(buyM);
  const sellExchange = initExchange(sellM);
  
  // Check balances
  console.log(chalk.yellow('📊 Checking balances...\n'));
  const buyBal = await buyExchange.fetchBalance();
  const sellBal = await sellExchange.fetchBalance();
  
  const buyUSDT = buyBal['USDT']?.free || 0;
  const sellUSDT = sellBal['USDT']?.free || 0;
  
  console.log(chalk.white(`  ${buyM}: $${buyUSDT.toFixed(2)} USDT`));
  console.log(chalk.white(`  ${sellM}: $${sellUSDT.toFixed(2)} USDT`));
  
  if (buyUSDT < TRADE_SIZE) {
    throw new Error(`Insufficient balance on ${buyM}: need $${TRADE_SIZE}, have $${buyUSDT.toFixed(2)}`);
  }
  
  console.log(chalk.green('\n✅ Balances OK!'));
  
  // Verify markets
  console.log(chalk.yellow(`\n🔍 Verifying ${coin}/USDT markets...\n`));
  const buyMarkets = await buyExchange.loadMarkets();
  const sellMarkets = await sellExchange.loadMarkets();
  
  const pair = `${coin}/USDT`;
  if (!buyMarkets[pair] || !sellMarkets[pair]) {
    throw new Error(`${pair} not available on both exchanges`);
  }
  
  console.log(chalk.green('✅ Markets verified!'));
  
  // Calculate amount
  const coinAmount = TRADE_SIZE / buyP;
  console.log(chalk.yellow(`\n💰 Will trade ${coinAmount.toFixed(8)} ${coin}\n`));
  
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
  console.log(chalk.red.bold('\n⚠️  READY TO EXECUTE LIVE TRADE!\n'));
  console.log(chalk.white(`This will spend real money: $${TRADE_SIZE} USDT`));
  console.log(chalk.white(`Waiting 5 seconds... Press Ctrl+C to CANCEL!\n`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  // Countdown
  for (let i = 5; i > 0; i--) {
    process.stdout.write(chalk.yellow(`${i}... `));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(chalk.green('\n\n✅ EXECUTING NOW!\n'));
  
  try {
    // STEP 1: BUY
    console.log(chalk.cyan(`📊 Step 1: Buying ${coinAmount.toFixed(8)} ${coin} on ${buyM}...`));
    
    const buyOrder = await buyExchange.createMarketBuyOrder(pair, coinAmount);
    
    console.log(chalk.green(`✅ Buy order filled!`));
    console.log(chalk.gray(`   Order ID: ${buyOrder.id}`));
    console.log(chalk.gray(`   Price: $${(buyOrder.average || buyP).toFixed(6)}`));
    console.log(chalk.gray(`   Fee: $${(buyOrder.fee?.cost || 0).toFixed(4)}`));
    
    // STEP 2: SELL
    console.log(chalk.cyan(`\n📊 Step 2: Selling ${coinAmount.toFixed(8)} ${coin} on ${sellM}...`));
    
    let sellOrder = null;
    let attempts = 0;
    
    while (!sellOrder && attempts < 3) {
      try {
        attempts++;
        console.log(chalk.yellow(`   Attempt ${attempts}/3...`));
        
        sellOrder = await sellExchange.createMarketSellOrder(pair, coinAmount);
        
        console.log(chalk.green(`✅ Sell order filled!`));
        console.log(chalk.gray(`   Order ID: ${sellOrder.id}`));
        console.log(chalk.gray(`   Price: $${(sellOrder.average || sellP).toFixed(6)}`));
        console.log(chalk.gray(`   Fee: $${(sellOrder.fee?.cost || 0).toFixed(4)}`));
      } catch (err) {
        console.error(chalk.red(`   ❌ Attempt ${attempts} failed: ${err.message}`));
        
        if (attempts >= 3) {
          console.error(chalk.red.bold('\n🚨 CRITICAL: Sell failed after 3 attempts!'));
          console.error(chalk.red.bold(`🚨 ${coinAmount.toFixed(8)} ${coin} stuck on ${buyM}!`));
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Calculate results
    const buyTotal = coinAmount * (buyOrder.average || buyP);
    const sellTotal = coinAmount * (sellOrder.average || sellP);
    const totalFees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const actualProfit = sellTotal - buyTotal - totalFees;
    const roi = (actualProfit / TRADE_SIZE) * 100;
    
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.green.bold('🎉 TRADE COMPLETED SUCCESSFULLY!'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Buy Total:    $${buyTotal.toFixed(2)}`));
    console.log(chalk.white(`Sell Total:   $${sellTotal.toFixed(2)}`));
    console.log(chalk.white(`Total Fees:   $${totalFees.toFixed(4)}`));
    console.log(chalk.green.bold(`\nNet Profit:   $${actualProfit.toFixed(2)}`));
    console.log(chalk.green(`ROI:          ${roi.toFixed(2)}%\n`));
    
    // Log trade
    const logEntry = {
      timestamp: new Date().toISOString(),
      coin,
      buyExchange: buyM,
      sellExchange: sellM,
      tradeSize: TRADE_SIZE,
      coinAmount,
      buyPrice: buyOrder.average || buyP,
      sellPrice: sellOrder.average || sellP,
      fees: totalFees,
      profit: actualProfit,
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
    
    logs.push(logEntry);
    writeFileSync('./logs/live-trades.json', JSON.stringify(logs, null, 2));
    
    console.log(chalk.gray(`✅ Trade logged to ./logs/live-trades.json\n`));
    
    return logEntry;
    
  } catch (err) {
    console.error(chalk.red('\n❌ Trade execution failed:'), err.message);
    throw err;
  }
}

// Main
async function main() {
  try {
    console.log(chalk.yellow('📡 Fetching opportunities...\n'));
    
    const opps = await getOpportunities();
    
    if (opps.length === 0) {
      console.log(chalk.red('❌ No opportunities found.'));
      process.exit(0);
    }
    
    // Select FIRST (best) opportunity
    const selectedOpp = opps[0];
    
    console.log(chalk.green(`✅ Found ${opps.length} opportunities!`));
    console.log(chalk.green.bold(`\n🎯 Auto-selected BEST: ${selectedOpp.coin} (${selectedOpp.netSpread.toFixed(2)}%)\n`));
    
    // Execute
    await executeTrade(selectedOpp);
    
    console.log(chalk.green.bold('\n✅ ALL DONE! Trade completed successfully! 🎉\n'));
    
  } catch (err) {
    console.error(chalk.red('\n💥 Fatal error:'), err.message);
    console.error(chalk.yellow('\n💡 Check your API keys and exchange balances.\n'));
    process.exit(1);
  }
}

main();
