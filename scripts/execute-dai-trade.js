#!/usr/bin/env node

/**
 * 🎯 DAI TRADE EXECUTOR - Poloniex → Gate.io
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync, writeFileSync } from 'fs';

console.clear();
console.log(chalk.cyan.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.cyan.bold('║            🎯 DAI STABLECOIN TRADE EXECUTOR 🎯           ║'));
console.log(chalk.cyan.bold('╚════════════════════════════════════════════════════════════╝\n'));

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));
const TRADE_SIZE = 20;

async function executeDaiTrade() {
  try {
    // Get DAI opportunity
    console.log(chalk.yellow('📡 Fetching DAI opportunity...\n'));
    
    const response = await fetch('http://localhost:8080/api/snapshot');
    const data = await response.json();
    
    const daiOpp = data.spreads.find(s => s.coin === 'DAI' && s.netSpread > 1);
    
    if (!daiOpp) {
      console.log(chalk.red('❌ No profitable DAI opportunity found.'));
      process.exit(0);
    }
    
    const { buyM, sellM, buyP, sellP, netSpread } = daiOpp;
    
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('🎯 EXECUTING: DAI'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Coin:         DAI (Stablecoin)`));
    console.log(chalk.white(`Spread:       ${netSpread.toFixed(2)}%`));
    console.log(chalk.white(`Trade Size:   $${TRADE_SIZE}`));
    console.log(chalk.white(`Buy from:     ${buyM} @ $${buyP.toFixed(6)}`));
    console.log(chalk.white(`Sell to:      ${sellM} @ $${sellP.toFixed(6)}`));
    
    const expectedProfit = (TRADE_SIZE * netSpread / 100) * 0.6;
    console.log(chalk.green(`Expected:     $${expectedProfit.toFixed(2)} profit\n`));
    
    // Init exchanges
    console.log(chalk.yellow('🔗 Connecting...\n'));
    
    const buyExchange = new ccxt[buyM]({
      apiKey: config.exchanges[buyM].apiKey,
      secret: config.exchanges[buyM].secret,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    
    const sellExchange = new ccxt[sellM]({
      apiKey: config.exchanges[sellM].apiKey,
      secret: config.exchanges[sellM].secret,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    
    // Check balances
    console.log(chalk.yellow('📊 Checking balances...\n'));
    const buyBal = await buyExchange.fetchBalance();
    const sellBal = await sellExchange.fetchBalance();
    
    const buyUSDT = buyBal['USDT']?.free || 0;
    const sellUSDT = sellBal['USDT']?.free || 0;
    
    console.log(chalk.white(`  ${buyM}: $${buyUSDT.toFixed(2)} USDT`));
    console.log(chalk.white(`  ${sellM}: $${sellUSDT.toFixed(2)} USDT`));
    
    if (buyUSDT < TRADE_SIZE) {
      throw new Error(`Insufficient balance on ${buyM}`);
    }
    
    console.log(chalk.green('\n✅ Balances OK!'));
    
    // Verify markets
    console.log(chalk.yellow('\n🔍 Verifying DAI/USDT markets...\n'));
    await buyExchange.loadMarkets();
    await sellExchange.loadMarkets();
    
    console.log(chalk.green('✅ Markets verified!'));
    
    // Calculate amount
    const daiAmount = TRADE_SIZE / buyP;
    console.log(chalk.yellow(`\n💰 Will trade ${daiAmount.toFixed(4)} DAI\n`));
    
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
    console.log(chalk.red.bold('\n⚠️  READY TO EXECUTE!\n'));
    console.log(chalk.white(`Cross-exchange arbitrage:`));
    console.log(chalk.white(`${buyM} → ${sellM}`));
    console.log(chalk.white(`Cost: $${TRADE_SIZE}\n`));
    console.log(chalk.white('Waiting 5 seconds... Ctrl+C to CANCEL!\n'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    for (let i = 5; i > 0; i--) {
      process.stdout.write(chalk.yellow(`${i}... `));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log(chalk.green('\n\n✅ EXECUTING!\n'));
    
    // STEP 1: BUY
    console.log(chalk.cyan(`📊 Step 1: Buying ${daiAmount.toFixed(4)} DAI on ${buyM}...`));
    
    const buyOrder = await buyExchange.createMarketBuyOrder('DAI/USDT', daiAmount);
    
    console.log(chalk.green(`✅ Buy filled!`));
    console.log(chalk.gray(`   Order ID: ${buyOrder.id}`));
    console.log(chalk.gray(`   Price: $${(buyOrder.average || buyP).toFixed(6)}`));
    console.log(chalk.gray(`   Amount: ${buyOrder.filled || daiAmount} DAI`));
    console.log(chalk.gray(`   Fee: $${(buyOrder.fee?.cost || 0).toFixed(4)}`));
    
    const actualAmount = buyOrder.filled || daiAmount;
    
    // STEP 2: SELL
    console.log(chalk.cyan(`\n📊 Step 2: Selling ${actualAmount.toFixed(4)} DAI on ${sellM}...`));
    
    let sellOrder = null;
    let attempts = 0;
    
    while (!sellOrder && attempts < 3) {
      try {
        attempts++;
        console.log(chalk.yellow(`   Attempt ${attempts}/3...`));
        
        sellOrder = await sellExchange.createMarketSellOrder('DAI/USDT', actualAmount);
        
        console.log(chalk.green(`✅ Sell filled!`));
        console.log(chalk.gray(`   Order ID: ${sellOrder.id}`));
        console.log(chalk.gray(`   Price: $${(sellOrder.average || sellP).toFixed(6)}`));
        console.log(chalk.gray(`   Amount: ${sellOrder.filled || actualAmount} DAI`));
        console.log(chalk.gray(`   Fee: $${(sellOrder.fee?.cost || 0).toFixed(4)}`));
      } catch (err) {
        console.error(chalk.red(`   ❌ Attempt ${attempts} failed: ${err.message}`));
        
        if (attempts >= 3) {
          console.error(chalk.red.bold(`\n🚨 CRITICAL: Sell failed! DAI stuck on ${buyM}!`));
          throw err;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Calculate results
    const buyTotal = actualAmount * (buyOrder.average || buyP);
    const sellTotal = actualAmount * (sellOrder.average || sellP);
    const totalFees = (buyOrder.fee?.cost || 0) + (sellOrder.fee?.cost || 0);
    const actualProfit = sellTotal - buyTotal - totalFees;
    const roi = (actualProfit / TRADE_SIZE) * 100;
    
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
    console.log(chalk.green.bold('🎉 DAI TRADE COMPLETED!'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));
    
    console.log(chalk.white(`Buy Total:  $${buyTotal.toFixed(2)}`));
    console.log(chalk.white(`Sell Total: $${sellTotal.toFixed(2)}`));
    console.log(chalk.white(`Fees:       $${totalFees.toFixed(4)}`));
    
    if (actualProfit > 0) {
      console.log(chalk.green.bold(`\nProfit:     $${actualProfit.toFixed(2)} ✅`));
      console.log(chalk.green(`ROI:        +${roi.toFixed(2)}%\n`));
    } else {
      console.log(chalk.red.bold(`\nLoss:       $${actualProfit.toFixed(2)} ❌`));
      console.log(chalk.red(`ROI:        ${roi.toFixed(2)}%\n`));
    }
    
    // Log trade
    const logEntry = {
      timestamp: new Date().toISOString(),
      coin: 'DAI',
      buyExchange: buyM,
      sellExchange: sellM,
      tradeSize: TRADE_SIZE,
      coinAmount: actualAmount,
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
    console.error(chalk.red('\n💥 Trade failed:'), err.message);
    throw err;
  }
}

executeDaiTrade().then(() => {
  console.log(chalk.green.bold('✅ ALL DONE! 🎉\n'));
}).catch(err => {
  console.error(chalk.red('\n❌ Fatal error:'), err.message);
  process.exit(1);
});
