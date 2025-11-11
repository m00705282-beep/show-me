#!/usr/bin/env node

/**
 * 🚀 SAFE TRADE EXECUTOR
 * Proverava sve PRE izvršenja + prefers same-exchange sell ako je moguće
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║          🛡️ SAFE ARBITRAGE TRADE EXECUTOR 🛡️            ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;

// Get valid opportunities
async function getValidOpportunities() {
  const response = await fetch('http://localhost:8080/api/snapshot');
  const data = await response.json();
  
  // Filter for configured exchanges with good spreads
  const validOpps = data.spreads.filter(s => {
    const buyEx = config.exchanges[s.buyM];
    const sellEx = config.exchanges[s.sellM];
    
    return s.netSpread > 0.8 &&
           buyEx && buyEx.enabled && buyEx.apiKey &&
           sellEx && sellEx.enabled && sellEx.apiKey;
  });
  
  return validOpps.sort((a, b) => b.netSpread - a.netSpread);
}

// Init exchange
function initExchange(exchangeId) {
  const cfg = config.exchanges[exchangeId];
  const ExchangeClass = ccxt[exchangeId];
  return new ExchangeClass({
    apiKey: cfg.apiKey,
    secret: cfg.secret,
    password: cfg.password || cfg.passphrase,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
  });
}

// Execute safer trade
async function executeSafeTrade(opp) {
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
  const buyCoin = buyBal[coin]?.free || 0;
  const sellCoin = sellBal[coin]?.free || 0;
  
  console.log(chalk.white(`  ${buyM}:`));
  console.log(chalk.gray(`    USDT: $${buyUSDT.toFixed(2)}`));
  console.log(chalk.gray(`    ${coin}: ${buyCoin.toFixed(4)}`));
  
  console.log(chalk.white(`  ${sellM}:`));
  console.log(chalk.gray(`    USDT: $${sellUSDT.toFixed(2)}`));
  console.log(chalk.gray(`    ${coin}: ${sellCoin.toFixed(4)}`));
  
  if (buyUSDT < TRADE_SIZE) {
    throw new Error(`Insufficient USDT on ${buyM}: need $${TRADE_SIZE}, have $${buyUSDT.toFixed(2)}`);
  }
  
  console.log(chalk.green('\n✅ Balances OK!'));
  
  // Calculate amount
  const coinAmount = TRADE_SIZE / buyP;
  
  // NEW: Check if we can sell on SELL exchange or should use BUY exchange
  let actualSellExchange = sellExchange;
  let actualSellM = sellM;
  let actualSellP = sellP;
  
  // If sell exchange has existing coins, we can use them
  // Otherwise, prefer to sell on the buy exchange (same exchange arbitrage)
  if (sellCoin < coinAmount * 0.1 && buyCoin > 0) {
    console.log(chalk.yellow(`\n⚠️  ${sellM} has low ${coin} balance!`));
    console.log(chalk.yellow(`💡 Will sell on ${buyM} instead (safer)\n`));
    
    actualSellExchange = buyExchange;
    actualSellM = buyM;
    
    // Get price on buy exchange
    const ticker = await buyExchange.fetchTicker(`${coin}/USDT`);
    actualSellP = ticker.bid || ticker.last;
    
    console.log(chalk.white(`Adjusted sell price on ${buyM}: $${actualSellP.toFixed(6)}\n`));
  }
  
  // Verify markets
  console.log(chalk.yellow(`🔍 Verifying ${coin}/USDT markets...\n`));
  const buyMarkets = await buyExchange.loadMarkets();
  const sellMarkets = await actualSellExchange.loadMarkets();
  
  const pair = `${coin}/USDT`;
  if (!buyMarkets[pair] || !sellMarkets[pair]) {
    throw new Error(`${pair} not available`);
  }
  
  console.log(chalk.green('✅ Markets verified!'));
  console.log(chalk.yellow(`\n💰 Will trade ${coinAmount.toFixed(8)} ${coin}\n`));
  
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
  console.log(chalk.red.bold('\n⚠️  READY TO EXECUTE!\n'));
  console.log(chalk.white(`Buy:  ${buyM}`));
  console.log(chalk.white(`Sell: ${actualSellM}`));
  console.log(chalk.white(`Cost: $${TRADE_SIZE}\n`));
  console.log(chalk.white('Waiting 5 seconds... Ctrl+C to CANCEL!\n'));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
  
  for (let i = 5; i > 0; i--) {
    process.stdout.write(chalk.yellow(`${i}... `));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(chalk.green('\n\n✅ EXECUTING!\n'));
  
  try {
    // BUY
    console.log(chalk.cyan(`📊 Step 1: Buying ${coinAmount.toFixed(8)} ${coin} on ${buyM}...`));
    const buyOrder = await buyExchange.createMarketBuyOrder(pair, coinAmount);
    
    console.log(chalk.green(`✅ Buy filled!`));
    console.log(chalk.gray(`   ID: ${buyOrder.id}`));
    console.log(chalk.gray(`   Price: $${(buyOrder.average || buyP).toFixed(6)}`));
    console.log(chalk.gray(`   Fee: $${(buyOrder.fee?.cost || 0).toFixed(4)}`));
    
    // SELL
    console.log(chalk.cyan(`\n📊 Step 2: Selling ${coinAmount.toFixed(8)} ${coin} on ${actualSellM}...`));
    
    let sellOrder = null;
    let attempts = 0;
    
    while (!sellOrder && attempts < 3) {
      try {
        attempts++;
        console.log(chalk.yellow(`   Attempt ${attempts}/3...`));
        
        sellOrder = await actualSellExchange.createMarketSellOrder(pair, coinAmount);
        
        console.log(chalk.green(`✅ Sell filled!`));
        console.log(chalk.gray(`   ID: ${sellOrder.id}`));
        console.log(chalk.gray(`   Price: $${(sellOrder.average || actualSellP).toFixed(6)}`));
        console.log(chalk.gray(`   Fee: $${(sellOrder.fee?.cost || 0).toFixed(4)}`));
      } catch (err) {
        console.error(chalk.red(`   ❌ Failed: ${err.message}`));
        
        if (attempts >= 3) {
          console.error(chalk.red.bold(`\n🚨 Sell failed! ${coin} stuck on ${buyM}!`));
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Results
    const buyTotal = coinAmount * (buyOrder.average || buyP);
    const sellTotal = coinAmount * (sellOrder.average || actualSellP);
    const totalFees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const actualProfit = sellTotal - buyTotal - totalFees;
    const roi = (actualProfit / TRADE_SIZE) * 100;
    
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.green.bold('🎉 TRADE COMPLETED!'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Buy:   $${buyTotal.toFixed(2)}`));
    console.log(chalk.white(`Sell:  $${sellTotal.toFixed(2)}`));
    console.log(chalk.white(`Fees:  $${totalFees.toFixed(4)}`));
    console.log(chalk.green.bold(`\nProfit: $${actualProfit.toFixed(2)}`));
    console.log(chalk.green(`ROI:    ${roi.toFixed(2)}%\n`));
    
    // Log
    const logEntry = {
      timestamp: new Date().toISOString(),
      coin,
      buyExchange: buyM,
      sellExchange: actualSellM,
      tradeSize: TRADE_SIZE,
      coinAmount,
      buyPrice: buyOrder.average || buyP,
      sellPrice: sellOrder.average || actualSellP,
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
    
    console.log(chalk.gray(`✅ Logged!\n`));
    
    return logEntry;
    
  } catch (err) {
    console.error(chalk.red('\n❌ Failed:'), err.message);
    throw err;
  }
}

// Main
async function main() {
  try {
    console.log(chalk.yellow('📡 Fetching opportunities...\n'));
    
    const opps = await getValidOpportunities();
    
    if (opps.length === 0) {
      console.log(chalk.red('❌ No opportunities.'));
      process.exit(0);
    }
    
    console.log(chalk.green(`✅ Found ${opps.length} opportunities!\n`));
    
    opps.slice(0, 3).forEach((opp, i) => {
      console.log(chalk.white(`${i + 1}. ${opp.coin.padEnd(8)} ${opp.netSpread.toFixed(2).padStart(5)}%  ${opp.buyM} → ${opp.sellM}`));
    });
    
    const selected = opps[0];
    console.log(chalk.green.bold(`\n🎯 Selected: ${selected.coin} (${selected.netSpread.toFixed(2)}%)\n`));
    
    await executeSafeTrade(selected);
    
    console.log(chalk.green.bold('\n✅ DONE! 🎉\n'));
    
  } catch (err) {
    console.error(chalk.red('\n💥 Error:'), err.message);
    process.exit(1);
  }
}

main();
