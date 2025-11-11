#!/usr/bin/env node

/**
 * 🚀 LIVE TRADE EXECUTOR
 * Executes a single arbitrage trade with full safety checks
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import readline from 'readline';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║           🚀 LIVE ARBITRAGE TRADE EXECUTOR 🚀            ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

// Load config
const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));

// Get current snapshot
async function getOpportunities() {
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  return data.spreads.filter(s => s.netSpread > 0.8).sort((a, b) => b.netSpread - a.netSpread);
}

// Initialize exchanges
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

// Check balances
async function checkBalances(buyExchange, sellExchange, tradeSize) {
  console.log(chalk.yellow('\n📊 Checking balances...\n'));
  
  const buyBal = await buyExchange.fetchBalance();
  const sellBal = await sellExchange.fetchBalance();
  
  const buyUSDT = buyBal['USDT']?.free || 0;
  const sellUSDT = sellBal['USDT']?.free || 0;
  
  console.log(chalk.white(`  ${buyExchange.id}: $${buyUSDT.toFixed(2)} USDT`));
  console.log(chalk.white(`  ${sellExchange.id}: $${sellUSDT.toFixed(2)} USDT`));
  
  if (buyUSDT < tradeSize) {
    throw new Error(`Insufficient balance on ${buyExchange.id}: need $${tradeSize}, have $${buyUSDT.toFixed(2)}`);
  }
  
  console.log(chalk.green('\n✅ Balances OK!'));
  return { buyUSDT, sellUSDT };
}

// Verify markets exist
async function verifyMarkets(buyExchange, sellExchange, coin) {
  console.log(chalk.yellow(`\n🔍 Verifying ${coin}/USDT markets...\n`));
  
  const buyMarkets = await buyExchange.loadMarkets();
  const sellMarkets = await sellExchange.loadMarkets();
  
  const pair = `${coin}/USDT`;
  
  if (!buyMarkets[pair]) {
    throw new Error(`${pair} not available on ${buyExchange.id}`);
  }
  if (!sellMarkets[pair]) {
    throw new Error(`${pair} not available on ${sellExchange.id}`);
  }
  
  console.log(chalk.green('✅ Markets verified!'));
  return true;
}

// Execute trade
async function executeTrade(opportunity, tradeSize = 50) {
  const { coin, buyM, sellM, buyP, sellP, netSpread } = opportunity;
  
  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold(`🎯 EXECUTING TRADE: ${coin}`));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  console.log(chalk.white(`Coin:         ${coin}`));
  console.log(chalk.white(`Spread:       ${netSpread.toFixed(2)}%`));
  console.log(chalk.white(`Trade Size:   $${tradeSize}`));
  console.log(chalk.white(`Buy from:     ${buyM} @ $${buyP.toFixed(6)}`));
  console.log(chalk.white(`Sell to:      ${sellM} @ $${sellP.toFixed(6)}`));
  
  const expectedProfit = (tradeSize * netSpread / 100) * 0.6; // After fees
  console.log(chalk.green(`\nExpected:     $${expectedProfit.toFixed(2)} profit`));
  
  // Initialize exchanges
  console.log(chalk.yellow('\n🔗 Connecting to exchanges...\n'));
  const buyExchange = initExchange(buyM);
  const sellExchange = initExchange(sellM);
  
  // Check balances
  await checkBalances(buyExchange, sellExchange, tradeSize);
  
  // Verify markets
  await verifyMarkets(buyExchange, sellExchange, coin);
  
  // Calculate amounts
  const coinAmount = tradeSize / buyP;
  console.log(chalk.yellow(`\n💰 Will buy ${coinAmount.toFixed(8)} ${coin}\n`));
  
  // USER CONFIRMATION
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question(chalk.red.bold('\n⚠️  EXECUTE LIVE TRADE? (yes/no): '), resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log(chalk.yellow('\n❌ Trade cancelled by user.'));
    return null;
  }
  
  console.log(chalk.green('\n✅ CONFIRMED - Executing...\n'));
  
  try {
    // STEP 1: BUY
    console.log(chalk.cyan(`📊 Step 1: Buying ${coinAmount.toFixed(8)} ${coin} on ${buyM}...`));
    
    const buyOrder = await buyExchange.createMarketBuyOrder(`${coin}/USDT`, coinAmount);
    
    console.log(chalk.green(`✅ Buy order filled!`));
    console.log(chalk.gray(`   Order ID: ${buyOrder.id}`));
    console.log(chalk.gray(`   Price: $${(buyOrder.average || buyP).toFixed(6)}`));
    console.log(chalk.gray(`   Fee: $${(buyOrder.fee?.cost || 0).toFixed(4)}`));
    
    // STEP 2: SELL
    console.log(chalk.cyan(`\n📊 Step 2: Selling ${coinAmount.toFixed(8)} ${coin} on ${sellM}...`));
    
    let sellOrder = null;
    let attempts = 0;
    const maxRetries = 3;
    
    while (!sellOrder && attempts < maxRetries) {
      try {
        attempts++;
        console.log(chalk.yellow(`   Attempt ${attempts}/${maxRetries}...`));
        
        sellOrder = await sellExchange.createMarketSellOrder(`${coin}/USDT`, coinAmount);
        
        console.log(chalk.green(`✅ Sell order filled!`));
        console.log(chalk.gray(`   Order ID: ${sellOrder.id}`));
        console.log(chalk.gray(`   Price: $${(sellOrder.average || sellP).toFixed(6)}`));
        console.log(chalk.gray(`   Fee: $${(sellOrder.fee?.cost || 0).toFixed(4)}`));
      } catch (err) {
        console.error(chalk.red(`   ❌ Attempt ${attempts} failed: ${err.message}`));
        
        if (attempts >= maxRetries) {
          console.error(chalk.red.bold('\n🚨 CRITICAL ERROR: Sell failed after 3 attempts!'));
          console.error(chalk.red.bold(`🚨 ${coinAmount.toFixed(8)} ${coin} is stuck on ${buyM}!`));
          console.error(chalk.red.bold('🚨 MANUAL INTERVENTION REQUIRED!'));
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // CALCULATE RESULTS
    const buyTotal = coinAmount * (buyOrder.average || buyP);
    const sellTotal = coinAmount * (sellOrder.average || sellP);
    const totalFees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const actualProfit = sellTotal - buyTotal - totalFees;
    
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.green.bold('🎉 TRADE COMPLETED SUCCESSFULLY!'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Buy Total:    $${buyTotal.toFixed(2)}`));
    console.log(chalk.white(`Sell Total:   $${sellTotal.toFixed(2)}`));
    console.log(chalk.white(`Total Fees:   $${totalFees.toFixed(4)}`));
    console.log(chalk.green.bold(`\nNet Profit:   $${actualProfit.toFixed(2)}`));
    console.log(chalk.green(`ROI:          ${((actualProfit / tradeSize) * 100).toFixed(2)}%\n`));
    
    // Save to log file
    const logEntry = {
      timestamp: new Date().toISOString(),
      coin,
      buyExchange: buyM,
      sellExchange: sellM,
      tradeSize,
      coinAmount,
      buyPrice: buyOrder.average || buyP,
      sellPrice: sellOrder.average || sellP,
      fees: totalFees,
      profit: actualProfit,
      roi: (actualProfit / tradeSize) * 100
    };
    
    const fs = await import('fs');
    const logPath = './logs/live-trades.json';
    
    let logs = [];
    try {
      logs = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    } catch (e) {
      // File doesn't exist yet
    }
    
    logs.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
    
    console.log(chalk.gray(`✅ Trade logged to ${logPath}\n`));
    
    return logEntry;
    
  } catch (err) {
    console.error(chalk.red('\n❌ Trade execution failed:'), err.message);
    throw err;
  }
}

// Main
async function main() {
  console.log(chalk.yellow('📡 Fetching current opportunities...\n'));
  
  const opportunities = await getOpportunities();
  
  if (opportunities.length === 0) {
    console.log(chalk.red('❌ No opportunities found with >0.8% spread.'));
    process.exit(0);
  }
  
  console.log(chalk.green(`✅ Found ${opportunities.length} opportunities!\n`));
  
  // Display top 5
  opportunities.slice(0, 5).forEach((opp, i) => {
    const color = opp.netSpread > 1.5 ? 'green' : opp.netSpread > 1 ? 'yellow' : 'white';
    console.log(chalk[color](`${i + 1}. ${opp.coin.padEnd(8)} ${opp.netSpread.toFixed(2).padStart(5)}%  ${opp.buyM} → ${opp.sellM}`));
  });
  
  // Select trade
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const choice = await new Promise(resolve => {
    rl.question(chalk.cyan('\n\n💡 Select trade number (1-5) or 0 to exit: '), resolve);
  });
  rl.close();
  
  const idx = parseInt(choice) - 1;
  
  if (idx < 0 || idx >= opportunities.length) {
    console.log(chalk.yellow('\n👋 Exiting...'));
    process.exit(0);
  }
  
  const selectedOpp = opportunities[idx];
  
  // Ask for trade size
  const rl2 = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const tradeSize = await new Promise(resolve => {
    rl2.question(chalk.cyan('\n💰 Trade size in USD (default $50): '), (answer) => {
      resolve(answer ? parseFloat(answer) : 50);
    });
  });
  rl2.close();
  
  // Execute
  await executeTrade(selectedOpp, tradeSize);
}

main().catch(err => {
  console.error(chalk.red('\n💥 Fatal error:'), err.message);
  process.exit(1);
});
