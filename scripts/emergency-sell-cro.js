#!/usr/bin/env node

/**
 * 🚨 EMERGENCY: Sell stuck CRO on AscendEX
 */

import ccxt from 'ccxt';
import chalk from 'chalk';
import { readFileSync } from 'fs';

console.clear();
console.log(chalk.red.bold('\n╔════════════════════════════════════════════════════════════╗'));
console.log(chalk.red.bold('║           🚨 EMERGENCY CRO SELL - ASCENDEX 🚨            ║'));
console.log(chalk.red.bold('╚════════════════════════════════════════════════════════════╝\n'));

const config = JSON.parse(readFileSync('./config/realtrading.json', 'utf8'));

async function emergencySell() {
  try {
    // Connect to AscendEX
    console.log(chalk.yellow('🔗 Connecting to AscendEX...\n'));
    
    const cfg = config.exchanges.ascendex;
    const exchange = new ccxt.ascendex({
      apiKey: cfg.apiKey,
      secret: cfg.secret,
      password: cfg.password,
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    
    // Check CRO balance
    console.log(chalk.yellow('📊 Checking CRO balance...\n'));
    const balance = await exchange.fetchBalance();
    const croBalance = balance['CRO']?.free || 0;
    
    console.log(chalk.white(`CRO Balance: ${croBalance.toFixed(8)} CRO\n`));
    
    if (croBalance < 1) {
      console.log(chalk.green('✅ No CRO to sell - all good!'));
      return;
    }
    
    // Get current CRO price
    const ticker = await exchange.fetchTicker('CRO/USDT');
    const currentPrice = ticker.last;
    
    console.log(chalk.white(`Current CRO price: $${currentPrice.toFixed(6)}\n`));
    
    const estimatedValue = croBalance * currentPrice;
    console.log(chalk.yellow(`Estimated value: $${estimatedValue.toFixed(2)} USDT\n`));
    
    console.log(chalk.red.bold('⚠️  SELLING CRO ON ASCENDEX!\n'));
    console.log(chalk.white('Waiting 3 seconds...\n'));
    
    for (let i = 3; i > 0; i--) {
      process.stdout.write(chalk.yellow(`${i}... `));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log(chalk.green('\n\n✅ EXECUTING!\n'));
    
    // SELL CRO
    console.log(chalk.cyan(`📊 Selling ${croBalance.toFixed(8)} CRO on AscendEX...`));
    
    const sellOrder = await exchange.createMarketSellOrder('CRO/USDT', croBalance);
    
    console.log(chalk.green.bold('\n🎉 SELL ORDER FILLED!\n'));
    console.log(chalk.white(`Order ID:     ${sellOrder.id}`));
    console.log(chalk.white(`Amount:       ${croBalance.toFixed(8)} CRO`));
    console.log(chalk.white(`Price:        $${(sellOrder.average || currentPrice).toFixed(6)}`));
    console.log(chalk.white(`Total:        $${((sellOrder.average || currentPrice) * croBalance).toFixed(2)} USDT`));
    console.log(chalk.white(`Fee:          $${(sellOrder.fee?.cost || 0).toFixed(4)}\n`));
    
    const recoveredValue = (sellOrder.average || currentPrice) * croBalance - (sellOrder.fee?.cost || 0);
    
    console.log(chalk.green.bold(`✅ Recovered: $${recoveredValue.toFixed(2)} USDT`));
    
    // Calculate loss/gain
    const originalSpent = 20; // We spent $20 on buy
    const netResult = recoveredValue - originalSpent;
    
    if (netResult >= 0) {
      console.log(chalk.green.bold(`🎉 Net Profit: +$${netResult.toFixed(2)}\n`));
    } else {
      console.log(chalk.red.bold(`❌ Net Loss: -$${Math.abs(netResult).toFixed(2)}\n`));
    }
    
    console.log(chalk.green.bold('✅ EMERGENCY RESOLVED! CRO sold successfully!\n'));
    
  } catch (err) {
    console.error(chalk.red('\n💥 Error:'), err.message);
    process.exit(1);
  }
}

emergencySell();
